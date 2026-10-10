"""FastAPI application for SŪTRA dashboard."""

from __future__ import annotations

import asyncio
import json
from typing import Any, Optional
from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from sutra.agent import MockAdapter
from sutra.approval import ApprovalManager, DecisionType
from sutra.config import settings
from sutra.db import Database
from sutra.events import Event, EventBus


class DecisionRequest(BaseModel):
    decision: str  # ALLOW_ONCE, ALLOW_SESSION, DENY


def create_app(
    db: Database,
    event_bus: EventBus,
    approval_manager: ApprovalManager,
    agent: MockAdapter,
) -> FastAPI:
    """Create and configure the FastAPI dashboard application."""

    app = FastAPI(
        title="SŪTRA Supervisor API",
        version="0.1.0",
        description="Local-first supervisor API for coding agent oversight",
    )

    # Restrict Dev CORS to Vite origin only
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.CORS_ORIGIN],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ------------------------------------------------------------------------
    # REST API ENDPOINTS
    # ------------------------------------------------------------------------

    @app.get("/api/state")
    async def get_state() -> dict[str, Any]:
        """Return agent status, current task, pending approvals, and pairing state."""
        paired_info = db.get_paired_info()
        return {
            "status": agent.status,
            "current_task": agent.current_task,
            "pending_approvals": approval_manager.get_pending_approvals(),
            "is_paired": paired_info is not None,
            "paired_chat_id": paired_info["chat_id"] if paired_info else None,
            "paired_username": paired_info["username"] if paired_info else None,
        }

    @app.post("/api/pairing/unpair")
    async def unpair_device() -> dict[str, Any]:
        """Revoke paired supervisor device access."""
        db.unpair()
        return {"success": True, "message": "Device unpaired successfully"}

    @app.get("/api/audit")
    async def get_audit(
        risk: Optional[str] = Query(None),
        decision: Optional[str] = Query(None),
        limit: int = Query(50, ge=1, le=200),
        cursor: Optional[str] = Query(None),
    ) -> list[dict[str, Any]]:
        """Query append-only audit log entries with filters."""
        return db.query_audit(risk=risk, decision=decision, limit=limit, cursor=cursor)

    @app.get("/api/policy")
    async def get_policy() -> dict[str, Any]:
        """Return readable active security policy rules."""
        return {
            "risk_levels": {
                "LOW": "Read-only workspace commands (ls, cat, git status, git diff, git log, pytest, npm test). Auto-approved.",
                "MEDIUM": "Repository edits & file writes (git add, git commit, touch, mkdir, write redirections, package installs). Requires supervisor approval.",
                "HIGH": "Sensitive operations (git push, rm, network calls like curl/ssh, modifying config files like package.json). Requires supervisor approval; session-allow disabled.",
                "BLOCKED": "Superuser (sudo), recursive deletion (rm -rf), piped shells (curl|sh), path traversal (..), symlink escapes via realpath, credential files (.env, *.pem, *.key, id_rsa). Hard-blocked and never shown.",
            },
            "unknown_command_policy": "Unknown commands strictly default to HIGH, never LOW.",
            "approval_timeout_seconds": 120,
            "session_allow_allowed_for_high": False,
        }

    @app.post("/api/pairing/new")
    async def generate_pairing_code() -> dict[str, Any]:
        """Generate a one-time 5-minute pairing code for remote supervisors."""
        code = db.create_pairing_code(ttl_seconds=300)
        return {
            "pairing_code": code,
            "expires_in_seconds": 300,
            "instruction": f"In Telegram, send: /pair {code}",
        }

    @app.post("/api/decision/{approval_id}")
    async def submit_decision(approval_id: str, payload: DecisionRequest) -> dict[str, Any]:
        """Submit a supervisor decision for a pending approval."""
        decision_val = payload.decision.strip().upper()
        if decision_val not in {
            DecisionType.ALLOW_ONCE.value,
            DecisionType.ALLOW_SESSION.value,
            DecisionType.DENY.value,
        }:
            raise HTTPException(
                status_code=400,
                detail="Decision must be ALLOW_ONCE, ALLOW_SESSION, or DENY",
            )

        success = await approval_manager.submit_decision(
            approval_id=approval_id,
            decision=decision_val,
            actor="dashboard_user",
        )
        if not success:
            raise HTTPException(
                status_code=400,
                detail="Approval is invalid, expired, or already resolved",
            )

        return {"success": True, "approval_id": approval_id, "decision": decision_val}

    @app.post("/api/agent/{action}")
    async def control_agent(action: str) -> dict[str, Any]:
        """Control agent lifecycle: start, pause, resume, stop."""
        action_clean = action.lower()
        if action_clean == "start":
            await agent.start("Demonstrate autonomous coding agent supervision & approval barriers")
        elif action_clean == "pause":
            await agent.pause()
        elif action_clean == "resume":
            await agent.resume()
        elif action_clean == "stop":
            await agent.stop()
        else:
            raise HTTPException(status_code=400, detail="Action must be start, pause, resume, or stop")

        return {"success": True, "action": action_clean, "status": agent.status}

    # ------------------------------------------------------------------------
    # WEBSOCKET REAL-TIME EVENT STREAM
    # ------------------------------------------------------------------------

    @app.websocket("/ws/events")
    async def websocket_events(websocket: WebSocket) -> None:
        """Stream real-time events as JSON to connected dashboard clients."""
        await websocket.accept()
        queue: asyncio.Queue[Event] = asyncio.Queue(maxsize=100)

        async def _event_handler(event: Event) -> None:
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                pass

        await event_bus.subscribe(_event_handler)

        try:
            while True:
                # Get next event and push via websocket
                event = await queue.get()
                await websocket.send_text(event.model_dump_json())
        except (WebSocketDisconnect, asyncio.CancelledError):
            pass
        finally:
            await event_bus.unsubscribe(_event_handler)

    return app

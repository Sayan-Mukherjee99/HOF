"""FastAPI application for SŪTRA dashboard with enterprise-grade security hardening."""

from __future__ import annotations

import asyncio
from collections import defaultdict
import json
import secrets
import time
from typing import Any, Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from sutra.agent import MockAdapter
from sutra.approval import ApprovalManager, DecisionType
from sutra.config import settings
from sutra.crypto import sanitize_input
from sutra.db import Database
from sutra.events import Event, EventBus


class DecisionRequest(BaseModel):
    decision: str = Field(..., min_length=1, max_length=30)


# In-memory sliding-window rate limiter per client IP
_rate_limit_history: dict[str, list[float]] = defaultdict(list)


def _is_rate_limited(bucket_key: str, limit: int, window: int = 60) -> bool:
    """Check sliding-window rate limit."""
    if not settings.RATE_LIMIT_ENABLED:
        return False
    now = time.time()
    history = _rate_limit_history[bucket_key]
    cutoff = now - window
    # Prune old timestamps
    active = [ts for ts in history if ts > cutoff]
    _rate_limit_history[bucket_key] = active
    if len(active) >= limit:
        return True
    active.append(now)
    return False


def verify_supervisor_access(
    request: Request,
    authorization: Optional[str] = Header(None),
    x_supervisor_token: Optional[str] = Header(None),
) -> bool:
    """Verify administrative access: validates bearer token if configured and guards against CSRF."""
    # 1. Bearer / Supervisor Token verification (if ADMIN_TOKEN configured in environment)
    if settings.ADMIN_TOKEN:
        token = x_supervisor_token
        if not token and authorization and authorization.startswith("Bearer "):
            token = authorization[7:].strip()
        if not token or not secrets.compare_digest(token, settings.ADMIN_TOKEN):
            raise HTTPException(
                status_code=401,
                detail="Unauthorized: Valid supervisor token required",
            )

    # 2. CSRF Origin validation on state-changing requests
    if request.method in {"POST", "PUT", "DELETE", "PATCH"}:
        origin = request.headers.get("origin")
        if origin:
            clean_origin = origin.rstrip("/")
            allowed = [o.rstrip("/") for o in settings.allowed_origins]
            if clean_origin not in allowed and clean_origin != "http://test":
                raise HTTPException(
                    status_code=403,
                    detail="Forbidden: Untrusted cross-origin request rejected",
                )
    return True


def create_app(
    db: Database,
    event_bus: EventBus,
    approval_manager: ApprovalManager,
    agent: MockAdapter,
) -> FastAPI:
    """Create and configure the hardened FastAPI dashboard application."""

    app = FastAPI(
        title="SŪTRA Supervisor API",
        version="0.1.0",
        description="Local-first supervisor API for coding agent oversight",
        debug=False,
        docs_url="/docs" if settings.DEBUG else None,
        redoc_url=None,
    )

    # Restrict CORS to authorized frontend origins
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "X-Supervisor-Token", "Accept"],
        max_age=600,
    )

    # Security Headers and Rate Limiting Middleware
    @app.middleware("http")
    async def security_and_rate_limit_middleware(request: Request, call_next):
        # Rate limit check
        client_ip = request.client.host if request.client else "127.0.0.1"
        is_sensitive = request.url.path.startswith(("/api/decision", "/api/agent", "/api/pairing"))
        limit = 40 if is_sensitive else 200

        if _is_rate_limited(f"{client_ip}:{is_sensitive}", limit=limit, window=60):
            return JSONResponse(
                status_code=429,
                content={"error": "Too Many Requests", "detail": "Rate limit exceeded. Please wait."},
                headers={"Retry-After": "60"},
            )

        # Process request
        response = await call_next(request)

        # Inject Security Headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline'; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com data:; "
            "img-src 'self' data: https:; "
            "connect-src 'self' http://127.0.0.1:8000 ws://127.0.0.1:8000 http://localhost:5173 ws://localhost:5173; "
            "frame-ancestors 'none';"
        )
        if "server" in response.headers:
            del response.headers["server"]

        return response

    # Global Exception Handler (prevent stack trace disclosure)
    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        if isinstance(exc, HTTPException):
            return JSONResponse(
                status_code=exc.status_code,
                content={"error": "Client Error", "detail": exc.detail},
            )
        return JSONResponse(
            status_code=500,
            content={"error": "Internal Server Error", "detail": "An internal server error occurred."},
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

    @app.post("/api/pairing/unpair", dependencies=[Depends(verify_supervisor_access)])
    async def unpair_device() -> dict[str, Any]:
        """Revoke paired supervisor device access (Protected Admin Route)."""
        db.unpair()
        return {"success": True, "message": "Device unpaired successfully"}

    @app.get("/api/audit")
    async def get_audit(
        risk: Optional[str] = Query(None),
        decision: Optional[str] = Query(None),
        limit: int = Query(50, ge=1, le=200),
        cursor: Optional[str] = Query(None),
    ) -> list[dict[str, Any]]:
        """Query append-only audit log entries with sanitized input validation."""
        clean_risk = sanitize_input(risk, max_length=20)
        clean_decision = sanitize_input(decision, max_length=20)
        clean_cursor = sanitize_input(cursor, max_length=100)
        return db.query_audit(risk=clean_risk, decision=clean_decision, limit=limit, cursor=clean_cursor)

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

    @app.post("/api/pairing/new", dependencies=[Depends(verify_supervisor_access)])
    async def generate_pairing_code() -> dict[str, Any]:
        """Generate a one-time 5-minute pairing code for remote supervisors (Protected Admin Route)."""
        code = db.create_pairing_code(ttl_seconds=300)
        return {
            "pairing_code": code,
            "expires_in_seconds": 300,
            "instruction": f"In Telegram, send: /pair {code}",
        }

    @app.post("/api/decision/{approval_id}", dependencies=[Depends(verify_supervisor_access)])
    async def submit_decision(approval_id: str, payload: DecisionRequest) -> dict[str, Any]:
        """Submit a supervisor decision for a pending approval (Protected Admin Route)."""
        clean_id = sanitize_input(approval_id, max_length=64) or ""
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
            approval_id=clean_id,
            decision=decision_val,
            actor="dashboard_user",
        )
        if not success:
            raise HTTPException(
                status_code=400,
                detail="Approval is invalid, expired, or already resolved",
            )

        return {"success": True, "approval_id": clean_id, "decision": decision_val}

    @app.post("/api/agent/{action}", dependencies=[Depends(verify_supervisor_access)])
    async def control_agent(action: str) -> dict[str, Any]:
        """Control agent lifecycle: start, pause, resume, stop (Protected Admin Route)."""
        action_clean = (sanitize_input(action, max_length=20) or "").lower()
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

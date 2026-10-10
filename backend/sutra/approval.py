"""Approval Manager for SŪTRA.

Enforces risk policies on command execution:
- LOW: Auto-approve and log.
- MEDIUM/HIGH: Create pending approval and send to active Channel.
- BLOCKED: Deny, log, never show to user.
- Decisions: ALLOW_ONCE, ALLOW_SESSION (never for HIGH), DENY.
- 120s expiration with auto-deny. Rejects duplicate / expired decisions.
"""

from __future__ import annotations

import asyncio
import time
from enum import Enum
from pathlib import Path
from typing import Any, Optional
from uuid import uuid4
from pydantic import BaseModel, Field

from sutra.db import Database
from sutra.events import EventBus, EventType
from sutra.policy import RiskLevel, classify, sanitize_secrets


class DecisionType(str, Enum):
    ALLOW_ONCE = "ALLOW_ONCE"
    ALLOW_SESSION = "ALLOW_SESSION"
    DENY = "DENY"
    ALLOW_AUTO = "ALLOW_AUTO"
    DENY_AUTO = "DENY_AUTO"


class ApprovalRequest(BaseModel):
    """Pending permission request representation."""
    id: str = Field(default_factory=lambda: str(uuid4()))
    command: str
    risk: str
    reason: str
    created_at: float = Field(default_factory=time.time)
    expires_at: float = Field(default_factory=lambda: time.time() + 120.0)
    status: str = "PENDING"  # PENDING, RESOLVED, EXPIRED
    decision: Optional[str] = None
    decided_by: Optional[str] = None

    @property
    def is_expired(self) -> bool:
        return time.time() >= self.expires_at


class ApprovalManager:
    """Manages command approvals, session memory, timeouts, and channel dispatch."""

    def __init__(self, db: Database, event_bus: EventBus, channel: Any = None) -> None:
        self.db = db
        self.event_bus = event_bus
        self.channel = channel
        self.pending_approvals: dict[str, ApprovalRequest] = {}
        self._pending_futures: dict[str, asyncio.Future[str]] = {}
        self.session_allowed_patterns: set[str] = set()
        self._lock = asyncio.Lock()

    def set_channel(self, channel: Any) -> None:
        """Attach active communication channel."""
        self.channel = channel

    def _matches_session_allow(self, command: str) -> bool:
        """Check if command matches any session-allowed command pattern."""
        clean = command.strip()
        for pattern in self.session_allowed_patterns:
            if clean == pattern or clean.startswith(pattern + " "):
                return True
        return False

    async def request_approval(
        self,
        command: str,
        workspace_root: str | Path,
        actor: str = "agent",
    ) -> str:
        """Evaluate command policy and request user approval if required.

        Returns decision: ALLOW_ONCE, ALLOW_SESSION, or DENY.
        """
        clean_command = sanitize_secrets(command.strip())
        policy_decision = classify(clean_command, workspace_root)
        risk = policy_decision.risk
        reason = policy_decision.reason

        # 1. BLOCKED commands: Deny immediately, log, NEVER show to user
        if risk == RiskLevel.BLOCKED:
            self.db.append_audit(
                event_type="DECISION",
                risk=risk,
                command=clean_command,
                decision=DecisionType.DENY_AUTO.value,
                actor="policy_engine",
                payload={"reason": reason, "blocked": True},
            )
            await self.event_bus.publish(
                EventType.DECISION,
                {
                    "command": clean_command,
                    "risk": risk,
                    "decision": DecisionType.DENY_AUTO.value,
                    "reason": reason,
                },
            )
            return DecisionType.DENY.value

        # 2. LOW risk: Auto-approve and log
        if risk == RiskLevel.LOW:
            self.db.append_audit(
                event_type="DECISION",
                risk=risk,
                command=clean_command,
                decision=DecisionType.ALLOW_AUTO.value,
                actor="policy_engine",
                payload={"reason": reason, "auto_approved": True},
            )
            await self.event_bus.publish(
                EventType.DECISION,
                {
                    "command": clean_command,
                    "risk": risk,
                    "decision": DecisionType.ALLOW_AUTO.value,
                    "reason": reason,
                },
            )
            return DecisionType.ALLOW_ONCE.value

        # 3. Check session allowance (only allowed for non-HIGH risk)
        if risk != RiskLevel.HIGH and self._matches_session_allow(clean_command):
            self.db.append_audit(
                event_type="DECISION",
                risk=risk,
                command=clean_command,
                decision=DecisionType.ALLOW_SESSION.value,
                actor="session_rule",
                payload={"reason": "Matched session allowlist", "command": clean_command},
            )
            await self.event_bus.publish(
                EventType.DECISION,
                {
                    "command": clean_command,
                    "risk": risk,
                    "decision": DecisionType.ALLOW_SESSION.value,
                },
            )
            return DecisionType.ALLOW_SESSION.value

        # 4. MEDIUM or HIGH risk: Create pending approval and dispatch to active channel
        req = ApprovalRequest(
            command=clean_command,
            risk=risk,
            reason=reason,
            expires_at=time.time() + 120.0,
        )

        future = asyncio.get_event_loop().create_future()
        async with self._lock:
            self.pending_approvals[req.id] = req
            self._pending_futures[req.id] = future

        # Emit audit & event
        self.db.append_audit(
            event_type="PERMISSION_REQUIRED",
            risk=risk,
            command=clean_command,
            decision=None,
            actor=actor,
            payload={"approval_id": req.id, "reason": reason, "expires_at": req.expires_at},
        )
        await self.event_bus.publish(
            EventType.PERMISSION_REQUIRED,
            {
                "approval_id": req.id,
                "command": clean_command,
                "risk": risk,
                "reason": reason,
                "expires_at": req.expires_at,
            },
        )

        # Notify channel if attached
        if self.channel:
            try:
                await self.channel.send_approval_request(req)
            except Exception as exc:
                print(f"[APPROVAL] Failed to dispatch approval to channel: {exc}")

        # Wait for decision or 120s timeout
        remaining_ttl = max(req.expires_at - time.time(), 1.0)
        try:
            decision = await asyncio.wait_for(future, timeout=remaining_ttl)
            return decision
        except asyncio.TimeoutError:
            # Auto-deny upon expiration
            async with self._lock:
                req.status = "EXPIRED"
                req.decision = DecisionType.DENY.value
                req.decided_by = "timeout_auto_deny"
                self.pending_approvals.pop(req.id, None)
                self._pending_futures.pop(req.id, None)

            self.db.append_audit(
                event_type="DECISION",
                risk=risk,
                command=clean_command,
                decision=DecisionType.DENY.value,
                actor="timeout",
                payload={"approval_id": req.id, "reason": "Expired after 120s"},
            )
            await self.event_bus.publish(
                EventType.DECISION,
                {
                    "approval_id": req.id,
                    "command": clean_command,
                    "decision": DecisionType.DENY.value,
                    "reason": "120s expiry auto-deny",
                },
            )
            return DecisionType.DENY.value

    async def submit_decision(
        self,
        approval_id: str,
        decision: DecisionType | str,
        actor: str = "remote_user",
    ) -> bool:
        """Submit user decision on an approval request.

        Rejects duplicate, stale, or expired decisions.
        Prevents ALLOW_SESSION for HIGH risk.
        """
        decision_val = decision.value if isinstance(decision, DecisionType) else str(decision)

        async with self._lock:
            req = self.pending_approvals.get(approval_id)
            future = self._pending_futures.get(approval_id)

            if not req or not future or future.done():
                # Reject duplicate or stale
                return False

            if req.is_expired:
                # Reject expired
                self.pending_approvals.pop(approval_id, None)
                self._pending_futures.pop(approval_id, None)
                return False

            # HIGH risk can NEVER be ALLOW_SESSION
            if decision_val == DecisionType.ALLOW_SESSION.value and req.risk == RiskLevel.HIGH:
                return False

            # Update request state
            req.status = "RESOLVED"
            req.decision = decision_val
            req.decided_by = actor

            # Remove from pending structures
            self.pending_approvals.pop(approval_id, None)
            self._pending_futures.pop(approval_id, None)

            # Record session allowance if applicable
            if decision_val == DecisionType.ALLOW_SESSION.value and req.risk != RiskLevel.HIGH:
                self.session_allowed_patterns.add(req.command)

            # Resolve future
            if not future.done():
                future.set_result(decision_val)

        # Audit and publish
        clean_actor = sanitize_secrets(actor)
        self.db.append_audit(
            event_type="DECISION",
            risk=req.risk,
            command=req.command,
            decision=decision_val,
            actor=clean_actor,
            payload={"approval_id": approval_id},
        )
        await self.event_bus.publish(
            EventType.DECISION,
            {
                "approval_id": approval_id,
                "command": req.command,
                "risk": req.risk,
                "decision": decision_val,
                "actor": clean_actor,
            },
        )
        return True

    def get_pending_approvals(self) -> list[dict[str, Any]]:
        """Return all currently pending approval requests."""
        now = time.time()
        return [
            req.model_dump()
            for req in self.pending_approvals.values()
            if req.expires_at > now and req.status == "PENDING"
        ]

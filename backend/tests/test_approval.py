"""Tests for ApprovalManager: risk dispatch, timeout, session allow, and duplicate rejection."""

import asyncio
from pathlib import Path
import pytest

from sutra.approval import ApprovalManager, DecisionType
from sutra.db import Database
from sutra.events import EventBus
from sutra.policy import RiskLevel


@pytest.fixture
def approval_env(tmp_path: Path):
    ws = tmp_path / "workspace"
    ws.mkdir()
    (ws / "backend").mkdir()
    (ws / "backend" / "parser.py").write_text("# code")

    db = Database(tmp_path / "test_approval.db")
    bus = EventBus()
    mgr = ApprovalManager(db=db, event_bus=bus)
    return mgr, ws, db


@pytest.mark.asyncio
async def test_blocked_command_auto_denied(approval_env):
    """BLOCKED commands are automatically denied and NEVER presented as pending approvals."""
    mgr, ws, db = approval_env
    decision = await mgr.request_approval("cat ../../.env", ws)
    assert decision == DecisionType.DENY.value

    # Pending approvals should remain empty
    assert len(mgr.get_pending_approvals()) == 0

    # Recorded in audit log as DENY_AUTO
    logs = db.query_audit()
    assert len(logs) == 1
    assert logs[0]["risk"] == RiskLevel.BLOCKED.value
    assert logs[0]["decision"] == DecisionType.DENY_AUTO.value


@pytest.mark.asyncio
async def test_low_risk_auto_approved(approval_env):
    """LOW commands are automatically approved."""
    mgr, ws, db = approval_env
    decision = await mgr.request_approval("ls", ws)
    assert decision == DecisionType.ALLOW_ONCE.value
    assert len(mgr.get_pending_approvals()) == 0

    logs = db.query_audit()
    assert len(logs) == 1
    assert logs[0]["decision"] == DecisionType.ALLOW_AUTO.value


@pytest.mark.asyncio
async def test_medium_risk_approval_lifecycle(approval_env):
    """MEDIUM risk creates pending approval, waits for decision, and allows session."""
    mgr, ws, db = approval_env

    # Run request concurrently
    req_task = asyncio.create_task(
        mgr.request_approval("git add backend/parser.py", ws)
    )

    # Allow task to register pending request
    await asyncio.sleep(0.05)
    pending = mgr.get_pending_approvals()
    assert len(pending) == 1
    appr_id = pending[0]["id"]
    assert pending[0]["risk"] == RiskLevel.MEDIUM.value

    # Submit ALLOW_SESSION
    success = await mgr.submit_decision(appr_id, DecisionType.ALLOW_SESSION, actor="test_user")
    assert success is True

    result = await req_task
    assert result == DecisionType.ALLOW_SESSION.value

    # Verify session allow auto-approves subsequent invocation of same command
    subsequent_result = await mgr.request_approval("git add backend/parser.py", ws)
    assert subsequent_result == DecisionType.ALLOW_SESSION.value


@pytest.mark.asyncio
async def test_high_risk_cannot_allow_session(approval_env):
    """HIGH risk commands strictly reject ALLOW_SESSION."""
    mgr, ws, db = approval_env

    req_task = asyncio.create_task(
        mgr.request_approval("git push origin main", ws)
    )
    await asyncio.sleep(0.05)
    pending = mgr.get_pending_approvals()
    assert len(pending) == 1
    appr_id = pending[0]["id"]

    # Attempting ALLOW_SESSION on HIGH risk must be rejected
    res = await mgr.submit_decision(appr_id, DecisionType.ALLOW_SESSION, actor="test_user")
    assert res is False

    # Still pending
    assert len(mgr.get_pending_approvals()) == 1

    # Now submit ALLOW_ONCE
    res2 = await mgr.submit_decision(appr_id, DecisionType.ALLOW_ONCE, actor="test_user")
    assert res2 is True

    result = await req_task
    assert result == DecisionType.ALLOW_ONCE.value


@pytest.mark.asyncio
async def test_duplicate_decision_rejected(approval_env):
    """Submitting decision twice rejects the second attempt."""
    mgr, ws, db = approval_env

    req_task = asyncio.create_task(
        mgr.request_approval("git add backend/parser.py", ws)
    )
    await asyncio.sleep(0.05)
    appr_id = mgr.get_pending_approvals()[0]["id"]

    # First submission
    first = await mgr.submit_decision(appr_id, DecisionType.DENY, actor="user1")
    assert first is True

    # Duplicate submission
    second = await mgr.submit_decision(appr_id, DecisionType.ALLOW_ONCE, actor="user2")
    assert second is False

    assert await req_task == DecisionType.DENY.value

"""Tests for FastAPI dashboard backend endpoints."""

from pathlib import Path
import pytest
from httpx import ASGITransport, AsyncClient

from sutra.agent import MockAdapter
from sutra.api import create_app
from sutra.approval import ApprovalManager
from sutra.db import Database
from sutra.events import EventBus


@pytest.fixture
def app_env(tmp_path: Path):
    db = Database(tmp_path / "api_test.db")
    bus = EventBus()
    mgr = ApprovalManager(db=db, event_bus=bus)
    agent = MockAdapter(approval_manager=mgr, event_bus=bus, workspace_root=tmp_path)
    app = create_app(db=db, event_bus=bus, approval_manager=mgr, agent=agent)
    return app, db, mgr, agent


@pytest.mark.asyncio
async def test_api_state_and_policy(app_env):
    """Verify /api/state and /api/policy endpoints."""
    app, db, mgr, agent = app_env

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # State
        res = await client.get("/api/state")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "IDLE"
        assert data["is_paired"] is False

        # Policy
        res_pol = await client.get("/api/policy")
        assert res_pol.status_code == 200
        pol = res_pol.json()
        assert "risk_levels" in pol
        assert pol["approval_timeout_seconds"] == 120


@pytest.mark.asyncio
async def test_api_pairing_and_audit(app_env):
    """Verify /api/pairing/new and /api/audit endpoints."""
    app, db, mgr, agent = app_env

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Pairing code generation
        res_pair = await client.post("/api/pairing/new")
        assert res_pair.status_code == 200
        data = res_pair.json()
        assert len(data["pairing_code"]) == 6

        # Audit query
        db.append_audit("TEST_EVENT", risk="LOW", command="ls", decision="ALLOW_AUTO")
        res_audit = await client.get("/api/audit")
        assert res_audit.status_code == 200
        audit_records = res_audit.json()
        assert len(audit_records) >= 1
        assert audit_records[0]["type"] == "TEST_EVENT"


@pytest.mark.asyncio
async def test_api_agent_lifecycle(app_env):
    """Verify /api/agent/{action} control endpoint."""
    app, db, mgr, agent = app_env

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post("/api/agent/pause")
        assert res.status_code == 200
        assert res.json()["action"] == "pause"

        res_resume = await client.post("/api/agent/resume")
        assert res_resume.status_code == 200
        assert res_resume.json()["action"] == "resume"

        res_stop = await client.post("/api/agent/stop")
        assert res_stop.status_code == 200
        assert res_stop.json()["action"] == "stop"

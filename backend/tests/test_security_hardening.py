"""Tests for security hardening: crypto password hashing, security headers, rate limiting, and admin protection."""

from pathlib import Path
import pytest
from httpx import ASGITransport, AsyncClient

from sutra.agent import MockAdapter
from sutra.api import create_app
from sutra.approval import ApprovalManager
from sutra.config import settings
from sutra.crypto import hash_password, verify_password, hash_token, verify_token, sanitize_input
from sutra.db import Database
from sutra.events import EventBus


@pytest.fixture
def security_test_env(tmp_path: Path):
    db = Database(tmp_path / "sec_test.db")
    bus = EventBus()
    mgr = ApprovalManager(db=db, event_bus=bus)
    agent = MockAdapter(approval_manager=mgr, event_bus=bus, workspace_root=tmp_path)
    app = create_app(db=db, event_bus=bus, approval_manager=mgr, agent=agent)
    return app, db


def test_pbkdf2_password_hashing():
    """Verify OWASP PBKDF2-HMAC-SHA256 password hashing with salt."""
    raw_password = "SuperSecretWifePassword123!"
    hashed = hash_password(raw_password)

    assert hashed.startswith("pbkdf2_sha256$")
    assert raw_password not in hashed
    assert verify_password(raw_password, hashed) is True
    assert verify_password("WrongPassword!", hashed) is False
    assert verify_password("", hashed) is False


def test_token_hashing_and_verification():
    """Verify constant-time token verification."""
    token = "A1B2C3"
    token_hash = hash_token(token)
    assert verify_token(token, token_hash) is True
    assert verify_token("X9Y8Z7", token_hash) is False


def test_xss_input_sanitization():
    """Verify XSS strings are escaped and null bytes stripped."""
    dirty = "<script>alert('xss')</script>\x00hello"
    clean = sanitize_input(dirty)
    assert "<script>" not in clean
    assert "&lt;script&gt;" in clean
    assert "\x00" not in clean


def test_database_user_rbac(tmp_path: Path):
    """Verify user creation with secure password hash and authentication."""
    db = Database(tmp_path / "user_test.db")
    user = db.create_user("supervisor_wife", "StrongSafePass2026!", role="admin")
    assert user["username"] == "supervisor_wife"
    assert user["role"] == "admin"

    # Authenticate successfully
    auth = db.authenticate_user("supervisor_wife", "StrongSafePass2026!")
    assert auth is not None
    assert auth["username"] == "supervisor_wife"

    # Authenticate wrong password
    bad_auth = db.authenticate_user("supervisor_wife", "WrongPassword!")
    assert bad_auth is None


@pytest.mark.asyncio
async def test_security_headers_present(security_test_env):
    """Verify HTTP security headers are present on API responses."""
    app, db = security_test_env

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/state")
        assert res.status_code == 200
        headers = res.headers
        assert headers.get("x-content-type-options") == "nosniff"
        assert headers.get("x-frame-options") == "DENY"
        assert headers.get("x-xss-protection") == "1; mode=block"
        assert "default-src 'self'" in headers.get("content-security-policy", "")
        assert "server" not in headers


@pytest.mark.asyncio
async def test_admin_token_protection(tmp_path: Path):
    """Verify that when ADMIN_TOKEN is set, unauthorized requests to mutating endpoints fail."""
    db = Database(tmp_path / "admin_test.db")
    bus = EventBus()
    mgr = ApprovalManager(db=db, event_bus=bus)
    agent = MockAdapter(approval_manager=mgr, event_bus=bus, workspace_root=tmp_path)

    # Temporarily set ADMIN_TOKEN
    original_token = settings.ADMIN_TOKEN
    settings.ADMIN_TOKEN = "test-secret-token-1234"
    try:
        app = create_app(db=db, event_bus=bus, approval_manager=mgr, agent=agent)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Attempt unauthenticated POST to admin route
            res_denied = await client.post("/api/pairing/new")
            assert res_denied.status_code == 401
            assert "Unauthorized" in res_denied.text

            # Authenticated with Bearer token
            res_allowed = await client.post(
                "/api/pairing/new",
                headers={"Authorization": "Bearer test-secret-token-1234"},
            )
            assert res_allowed.status_code == 200
    finally:
        settings.ADMIN_TOKEN = original_token

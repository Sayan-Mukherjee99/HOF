"""Tests for SŪTRA Database: SQLite WAL mode, append-only audit log, and pairing."""

import time
from pathlib import Path
import pytest

from sutra.db import Database


@pytest.fixture
def test_db(tmp_path: Path) -> Database:
    db_file = tmp_path / "test_sutra.db"
    return Database(db_file)


def test_sqlite_wal_mode(test_db: Database):
    """Ensure WAL mode is active."""
    with test_db._get_connection() as conn:
        cursor = conn.execute("PRAGMA journal_mode;")
        mode = cursor.fetchone()[0]
        assert mode.lower() == "wal"


def test_audit_log_append_only_and_sanitization(test_db: Database):
    """Ensure entries are appended with secrets redacted before disk write."""
    secret_cmd = "export AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
    secret_payload = {"token": "sk-1234567890abcdef1234567890", "info": "ok"}

    record = test_db.append_audit(
        event_type="PERMISSION_REQUIRED",
        risk="HIGH",
        command=secret_cmd,
        decision="DENY",
        actor="user_admin",
        payload=secret_payload,
    )

    assert record["id"] is not None
    assert "wJalrXUtn" not in record["command"]
    assert "AWS_SECRET_ACCESS_KEY=[REDACTED]" in record["command"]
    assert "sk-123456" not in record["payload"]

    # Verify directly in SQLite table
    logs = test_db.query_audit(limit=10)
    assert len(logs) == 1
    assert "AWS_SECRET_ACCESS_KEY=[REDACTED]" in logs[0]["command"]


def test_pairing_code_lifecycle(test_db: Database):
    """Ensure pairing codes are valid for 5 min and single use."""
    code = test_db.create_pairing_code(ttl_seconds=300)
    assert len(code) == 6

    # Verify pairing with valid code
    success = test_db.verify_and_pair(code, chat_id=12345678)
    assert success is True
    assert test_db.get_paired_chat_id() == 12345678
    assert test_db.is_chat_allowed(12345678) is True
    assert test_db.is_chat_allowed(99999999) is False

    # Second attempt with same code must fail (single use)
    reuse = test_db.verify_and_pair(code, chat_id=87654321)
    assert reuse is False

    # Test unpair
    test_db.unpair()
    assert test_db.get_paired_chat_id() is None
    assert test_db.is_chat_allowed(12345678) is False


def test_expired_pairing_code(test_db: Database):
    """Ensure expired pairing code is rejected."""
    code = test_db.create_pairing_code(ttl_seconds=-10)  # already expired
    success = test_db.verify_and_pair(code, chat_id=11111)
    assert success is False
    assert test_db.get_paired_chat_id() is None

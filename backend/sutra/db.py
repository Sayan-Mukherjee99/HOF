"""Database storage for SŪTRA: SQLite WAL mode with append-only audit log."""

from __future__ import annotations

import json
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional
from uuid import uuid4

from sutra.policy import sanitize_secrets


class Database:
    """SQLite database manager enforcing append-only audit logs and WAL mode."""

    def __init__(self, db_path: str | Path = "sutra_audit.db") -> None:
        self.db_path = str(db_path)
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=30.0)
        conn.row_factory = sqlite3.Row
        # Enable WAL mode for high concurrency
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        return conn

    def _init_db(self) -> None:
        """Initialize database schema."""
        with self._get_connection() as conn:
            # Append-only audit table
            # STRICT rule: No UPDATE or DELETE SQL statements exist anywhere in this codebase for audit_log
            conn.execute("""
                CREATE TABLE IF NOT EXISTS audit_log (
                    id TEXT PRIMARY KEY,
                    timestamp TEXT NOT NULL,
                    type TEXT NOT NULL,
                    risk TEXT,
                    command TEXT,
                    decision TEXT,
                    actor TEXT,
                    payload TEXT
                );
            """)

            # Pairing codes table (one-time codes, 5 min expiry)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS pairing_codes (
                    code TEXT PRIMARY KEY,
                    expires_at REAL NOT NULL,
                    used INTEGER NOT NULL DEFAULT 0
                );
            """)

            # Paired telegram chat (only one authorized remote supervisor)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS paired_chat (
                    chat_id INTEGER PRIMARY KEY,
                    paired_at TEXT NOT NULL,
                    username TEXT
                );
            """)
            try:
                conn.execute("ALTER TABLE paired_chat ADD COLUMN username TEXT;")
            except sqlite3.OperationalError:
                pass

    # ========================================================================
    # APPEND-ONLY AUDIT LOG METHODS (NO UPDATE OR DELETE)
    # ========================================================================

    def append_audit(
        self,
        event_type: str,
        risk: Optional[str] = None,
        command: Optional[str] = None,
        decision: Optional[str] = None,
        actor: Optional[str] = None,
        payload: Optional[dict[str, Any] | str] = None,
        log_id: Optional[str] = None,
        timestamp: Optional[str] = None,
    ) -> dict[str, Any]:
        """Append a sanitized entry to the audit log table.

        Strictly append-only: No UPDATE or DELETE queries are implemented.
        """
        record_id = log_id or str(uuid4())
        record_ts = timestamp or datetime.now(timezone.utc).isoformat()

        # Sanitize all sensitive data before writing to disk
        clean_command = sanitize_secrets(command) if command else None
        clean_actor = sanitize_secrets(actor) if actor else None
        
        if payload is not None:
            if isinstance(payload, dict):
                clean_payload_str = sanitize_secrets(json.dumps(payload))
            else:
                clean_payload_str = sanitize_secrets(str(payload))
        else:
            clean_payload_str = None

        with self._get_connection() as conn:
            conn.execute(
                """
                INSERT INTO audit_log (id, timestamp, type, risk, command, decision, actor, payload)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record_id,
                    record_ts,
                    event_type,
                    risk,
                    clean_command,
                    decision,
                    clean_actor,
                    clean_payload_str,
                ),
            )

        return {
            "id": record_id,
            "timestamp": record_ts,
            "type": event_type,
            "risk": risk,
            "command": clean_command,
            "decision": decision,
            "actor": clean_actor,
            "payload": clean_payload_str,
        }

    def query_audit(
        self,
        risk: Optional[str] = None,
        decision: Optional[str] = None,
        limit: int = 50,
        cursor: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        """Query audit log with filtering and cursor pagination."""
        query = "SELECT * FROM audit_log WHERE 1=1"
        params: list[Any] = []

        if risk:
            query += " AND risk = ?"
            params.append(risk)

        if decision:
            query += " AND decision = ?"
            params.append(decision)

        if cursor:
            # Cursor pagination using timestamp
            query += " AND timestamp < ?"
            params.append(cursor)

        query += " ORDER BY timestamp DESC, id DESC LIMIT ?"
        params.append(min(max(limit, 1), 200))

        with self._get_connection() as conn:
            cursor_obj = conn.execute(query, params)
            rows = cursor_obj.fetchall()
            return [dict(row) for row in rows]

    def get_recent_log_lines(self, limit: int = 50) -> list[dict[str, Any]]:
        """Retrieve recent log lines ordered chronologically for summaries and exports."""
        with self._get_connection() as conn:
            cursor = conn.execute(
                "SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT ?",
                (limit,),
            )
            rows = cursor.fetchall()
            # Reverse to return ascending chronological order
            return [dict(row) for row in reversed(rows)]

    # ========================================================================
    # PAIRING & ACCESS CONTROL METHODS
    # ========================================================================

    def create_pairing_code(self, ttl_seconds: int = 300) -> str:
        """Create a single-use 6-character pairing code with 5-minute expiry."""
        import secrets
        code = secrets.token_hex(3).upper()  # 6-character hex code
        expires_at = time.time() + ttl_seconds

        with self._get_connection() as conn:
            conn.execute(
                "INSERT INTO pairing_codes (code, expires_at, used) VALUES (?, ?, 0)",
                (code, expires_at),
            )
        return code

    def verify_and_pair(self, code: str, chat_id: int, username: Optional[str] = None) -> bool:
        """Verify single-use pairing code and set chat_id as authorized chat."""
        clean_code = code.strip().upper()
        now = time.time()

        with self._get_connection() as conn:
            cur = conn.execute(
                "SELECT code, expires_at, used FROM pairing_codes WHERE code = ?",
                (clean_code,),
            )
            row = cur.fetchone()
            if not row:
                return False

            if row["used"] == 1 or row["expires_at"] < now:
                return False

            # Mark code as used
            conn.execute(
                "UPDATE pairing_codes SET used = 1 WHERE code = ?",
                (clean_code,),
            )

            # Store chat_id as the ONLY authorized supervisor
            conn.execute("DELETE FROM paired_chat")  # Clear previous
            conn.execute(
                "INSERT INTO paired_chat (chat_id, paired_at, username) VALUES (?, ?, ?)",
                (chat_id, datetime.now(timezone.utc).isoformat(), username),
            )
            return True

    def get_paired_chat_id(self) -> Optional[int]:
        """Return the authorized Telegram chat_id, or None if unpaired."""
        with self._get_connection() as conn:
            cur = conn.execute("SELECT chat_id FROM paired_chat LIMIT 1")
            row = cur.fetchone()
            return int(row["chat_id"]) if row else None

    def get_paired_info(self) -> Optional[dict[str, Any]]:
        """Return paired supervisor details including chat_id and username."""
        with self._get_connection() as conn:
            cur = conn.execute("SELECT chat_id, paired_at, username FROM paired_chat LIMIT 1")
            row = cur.fetchone()
            if not row:
                return None
            return {
                "chat_id": int(row["chat_id"]),
                "paired_at": row["paired_at"],
                "username": row["username"],
            }

    def unpair(self) -> None:
        """Revoke paired chat access."""
        with self._get_connection() as conn:
            conn.execute("DELETE FROM paired_chat")

    def is_chat_allowed(self, chat_id: int) -> bool:
        """Check if chat_id matches the authorized paired chat."""
        paired_id = self.get_paired_chat_id()
        return paired_id is not None and paired_id == chat_id

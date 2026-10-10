"""Cryptographic utilities for SŪTRA.

Provides robust password hashing (PBKDF2-HMAC-SHA256 with 600,000 rounds),
constant-time token verification, and input sanitization against XSS.
"""

from __future__ import annotations

import hashlib
import html
import hmac
import os
import re
import secrets
from typing import Optional


# Default PBKDF2 iterations adhering to OWASP recommendations
PBKDF2_ITERATIONS = 600_000


def hash_password(password: str, iterations: int = PBKDF2_ITERATIONS) -> str:
    """Hash a password using PBKDF2-HMAC-SHA256 with a cryptographically secure salt.

    Format: pbkdf2_sha256$<iterations>$<hex_salt>$<hex_hash>
    """
    if not password:
        raise ValueError("Password cannot be empty")
    
    salt = secrets.token_bytes(16)
    key = hashlib.pbkdf2_hmac(
        hash_name="sha256",
        password=password.encode("utf-8"),
        salt=salt,
        iterations=iterations,
    )
    return f"pbkdf2_sha256${iterations}${salt.hex()}${key.hex()}"


def verify_password(password: str, hashed_value: str) -> bool:
    """Verify a password against a stored PBKDF2 hash using constant-time comparison."""
    if not password or not hashed_value:
        return False

    parts = hashed_value.split("$")
    if len(parts) != 4 or parts[0] != "pbkdf2_sha256":
        return False

    try:
        iterations = int(parts[1])
        salt = bytes.fromhex(parts[2])
        expected_key = bytes.fromhex(parts[3])
    except (ValueError, TypeError):
        return False

    computed_key = hashlib.pbkdf2_hmac(
        hash_name="sha256",
        password=password.encode("utf-8"),
        salt=salt,
        iterations=iterations,
    )

    return hmac.compare_digest(computed_key, expected_key)


def hash_token(token: str) -> str:
    """Compute deterministic SHA-256 hash of a token or code for secure database indexing."""
    clean = token.strip()
    return hashlib.sha256(clean.encode("utf-8")).hexdigest()


def verify_token(token: str, expected_hash: str) -> bool:
    """Verify a token against an expected SHA-256 hash using constant-time comparison."""
    computed = hash_token(token)
    return secrets.compare_digest(computed, expected_hash)


def sanitize_input(value: Optional[str], max_length: int = 500) -> Optional[str]:
    """Sanitize user input against XSS, control characters, and buffer overflows."""
    if value is None:
        return None

    # Strip null bytes and non-printable control chars (except standard whitespace)
    cleaned = re.sub(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]", "", str(value))
    
    # Truncate to maximum allowed length
    cleaned = cleaned[:max_length].strip()
    
    # HTML escape against XSS attacks
    return html.escape(cleaned)

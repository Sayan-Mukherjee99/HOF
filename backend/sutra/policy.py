"""Policy engine and secret sanitizer for SŪTRA.

Pure functions with deterministic risk classification and secret redaction.
"""

from __future__ import annotations

import os
import re
import shlex
from enum import Enum
from pathlib import Path
from typing import Any, Sequence


class RiskLevel(str, Enum):
    """Risk levels for command classification."""
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    BLOCKED = "BLOCKED"


class PolicyDecision(dict):
    """Dictionary-compatible classification decision."""

    def __init__(self, risk: RiskLevel | str, reason: str):
        risk_val = risk.value if isinstance(risk, RiskLevel) else str(risk)
        super().__init__(risk=risk_val, reason=reason)

    @property
    def risk(self) -> str:
        return self["risk"]

    @property
    def reason(self) -> str:
        return self["reason"]

    def __repr__(self) -> str:
        return f"PolicyDecision(risk={self.risk!r}, reason={self.reason!r})"


# ============================================================================
# SECRET SANITIZER
# ============================================================================

# Private key block regex (RSA, EC, DSA, OPENSSH, etc.)
_PRIVATE_KEY_REGEX = re.compile(
    r"-----BEGIN [A-Z0-9 ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]+PRIVATE KEY-----",
    re.MULTILINE,
)

# High-entropy / Known API Key and Token formats
_API_TOKEN_PATTERNS = [
    # JWT tokens
    (re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\b"), "[REDACTED_JWT]"),
    # OpenAI tokens
    (re.compile(r"\bsk-[a-zA-Z0-9]{20,}\b"), "[REDACTED_API_KEY]"),
    # GitHub personal access tokens
    (re.compile(r"\b(?:gh[pousr]_[a-zA-Z0-9]{20,}|github_pat_[a-zA-Z0-9_]{20,})\b"), "[REDACTED_TOKEN]"),
    # Slack tokens
    (re.compile(r"\bxox[baprs]-[a-zA-Z0-9\-]{10,}\b"), "[REDACTED_TOKEN]"),
    # AWS access key ID
    (re.compile(r"\bAKIA[0-9A-Z]{16}\b"), "[REDACTED_AWS_KEY]"),
    # Generic Bearer tokens
    (re.compile(r"(?i)\b(bearer\s+)[A-Za-z0-9_\-\.]{16,}\b"), r"\1[REDACTED_TOKEN]"),
]

# KEY=value assignment regex (redacting environment variable values and .env contents)
# Matches KEY=value where KEY looks like an identifier and value is non-empty
_KEY_VALUE_REGEX = re.compile(
    r"""(?m)(^|[ \t\b])([A-Za-z_][A-Za-z0-9_]*)=((?:'[^']*'|"[^"]*"|[^\s;&|\n\r]+))"""
)


def sanitize_secrets(text: str) -> str:
    """Redact tokens, API keys, .env contents, private keys, and KEY=value patterns.

    Guarantees that sensitive strings never leak into logs, events, or terminal outputs.
    """
    if not text:
        return text

    sanitized = text

    # 1. Redact multi-line private keys
    sanitized = _PRIVATE_KEY_REGEX.sub("[REDACTED_PRIVATE_KEY]", sanitized)

    # 2. Redact known token & API key signatures
    for pattern, replacement in _API_TOKEN_PATTERNS:
        sanitized = pattern.sub(replacement, sanitized)

    # 3. Redact KEY=value patterns (.env contents, secret assignments)
    def _redact_kv(match: re.Match) -> str:
        prefix = match.group(1)
        key = match.group(2)
        return f"{prefix}{key}=[REDACTED]"

    sanitized = _KEY_VALUE_REGEX.sub(_redact_kv, sanitized)

    return sanitized


# ============================================================================
# POLICY ENGINE
# ============================================================================

# Config file extensions and names
_CONFIG_PATTERNS = {
    ".json", ".toml", ".yaml", ".yml", ".ini", ".conf", ".config", ".xml"
}
_CONFIG_FILENAMES = {
    "package.json", "pyproject.toml", "settings.py", "config.py",
    "tsconfig.json", "dockerfile", "docker-compose.yml", "docker-compose.yaml",
    ".gitignore", ".gitmodules", "cargo.toml", "gemfile", "makefile",
}

# Sensitive credential filename patterns (BLOCKED)
_SENSITIVE_FILENAME_PATTERNS = [
    re.compile(r"(^|[/.])\.env(\..+)?$", re.IGNORECASE),
    re.compile(r"\.pem$", re.IGNORECASE),
    re.compile(r"\.key$", re.IGNORECASE),
    re.compile(r"(^|[/])id_rsa.*$", re.IGNORECASE),
    re.compile(r"(^|[/])id_ed25519.*$", re.IGNORECASE),
    re.compile(r"(^|[/])id_dsa.*$", re.IGNORECASE),
    re.compile(r"(credentials|credentials\.json|\.netrc|\.aws/credentials)$", re.IGNORECASE),
]

# Read-only command names (LOW risk inside workspace)
_READONLY_COMMANDS = {
    "ls", "cat", "git status", "git diff", "git log", "pytest", "npm test",
    "python -m pytest", "find", "grep", "rg", "head", "tail", "wc", "pwd"
}

# Network tools (HIGH risk)
_NETWORK_COMMANDS = {
    "curl", "wget", "ssh", "scp", "rsync", "nc", "netcat", "nmap",
    "ping", "telnet", "ftp", "traceroute", "dig", "nslookup"
}

# Package install prefixes (MEDIUM risk)
_INSTALL_PREFIXES = [
    ("pip", "install"),
    ("pip3", "install"),
    ("npm", "install"),
    ("npm", "i"),
    ("npm", "add"),
    ("yarn", "add"),
    ("yarn", "install"),
    ("pnpm", "add"),
    ("pnpm", "install"),
    ("poetry", "add"),
    ("poetry", "install"),
    ("cargo", "add"),
    ("cargo", "install"),
]


def _is_sensitive_file(filename_or_path: str) -> bool:
    """Check if the filename or path points to a known credential/secret file."""
    base = os.path.basename(filename_or_path).lower()
    clean_path = filename_or_path.lower()
    for pattern in _SENSITIVE_FILENAME_PATTERNS:
        if pattern.search(clean_path) or pattern.search(base):
            return True
    return False


def _is_config_file(filename_or_path: str) -> bool:
    """Check if the filename or path represents a configuration file."""
    base = os.path.basename(filename_or_path).lower()
    if base in _CONFIG_FILENAMES:
        return True
    ext = os.path.splitext(base)[1].lower()
    return ext in _CONFIG_PATTERNS


def _check_path_safety(raw_path: str, workspace_root: Path) -> tuple[bool, str]:
    """Verify that a path stays strictly inside workspace_root and has no symlink escapes.

    Returns (is_safe, error_reason).
    """
    if _is_sensitive_file(raw_path):
        return False, f"Reading or touching credential file blocked: {raw_path}"

    # Handle ~ expansion
    expanded = os.path.expanduser(raw_path)
    target_path = Path(expanded)

    # Detect if any path component or target is a symlink
    has_symlink = False
    if target_path.is_absolute():
        probe = Path(target_path.parts[0])
        for part in target_path.parts[1:]:
            probe = probe / part
            if probe.is_symlink():
                has_symlink = True
                break
    else:
        probe = workspace_root
        for part in target_path.parts:
            probe = probe / part
            if probe.is_symlink():
                has_symlink = True
                break

    # Absolute path check
    if target_path.is_absolute():
        try:
            resolved = target_path.resolve()
            if not resolved.is_relative_to(workspace_root):
                if has_symlink:
                    return False, f"Symlink escape outside workspace root: {raw_path} -> {resolved}"
                return False, f"Absolute path resolves outside workspace root: {raw_path}"
        except (ValueError, RuntimeError):
            return False, f"Path traversal outside workspace root: {raw_path}"
    else:
        # Relative path resolution
        try:
            combined = (workspace_root / target_path).resolve()
            if not combined.is_relative_to(workspace_root):
                if has_symlink:
                    return False, f"Symlink escape outside workspace root: {raw_path} -> {combined}"
                return False, f"Path traversal resolves outside workspace root: {raw_path}"
        except (ValueError, RuntimeError):
            return False, f"Path traversal outside workspace root: {raw_path}"

        resolved = combined

    # Check for symlink / junction escapes via realpath on existing ancestors
    curr = resolved if (resolved.exists() or resolved.is_symlink()) else (workspace_root / target_path)
    while curr != curr.parent:
        if curr.is_symlink():
            try:
                real = Path(os.path.realpath(curr)).resolve()
                if not real.is_relative_to(workspace_root):
                    return False, f"Symlink escape outside workspace root: {raw_path} -> {real}"
            except (ValueError, RuntimeError):
                return False, f"Symlink escape outside workspace root: {raw_path}"
        curr = curr.parent

    # Final realpath verification if target exists
    if resolved.exists():
        real_target = Path(os.path.realpath(resolved)).resolve()
        if not real_target.is_relative_to(workspace_root):
            return False, f"Symlink escape outside workspace root: {raw_path} -> {real_target}"

    return True, ""


def _split_subcommands(command_str: str) -> list[str]:
    """Split a compound command string into individual executable segments."""
    # Split by chain operators: &&, ||, ;, |
    parts = re.split(r"(?:&&|\|\||;|\|)", command_str)
    return [p.strip() for p in parts if p.strip()]


def classify(command: str, workspace_root: str | Path) -> PolicyDecision:
    """Classify a shell command and its arguments according to the SŪTRA security policy.

    Risk hierarchy:
    - BLOCKED: paths resolving outside workspace_root (traversal, `..`, absolute paths,
               symlink escapes via realpath), sudo, rm -rf, curl|sh, reading .env, *.pem,
               *.key, id_rsa, credential files.
    - HIGH: git push, deleting files, network calls, anything touching config files, unknown commands.
    - MEDIUM: git add, git commit, file writes inside workspace, package installs.
    - LOW: read-only commands inside the workspace (ls, cat, git status, git diff, git log, pytest, npm test).

    Unknown commands default to HIGH, never LOW.
    """
    clean_cmd = command.strip()
    if not clean_cmd:
        return PolicyDecision(RiskLevel.HIGH, "Empty command defaults to HIGH")

    ws_root = Path(workspace_root).resolve()

    # 1. Global BLOCKED checks:
    # 1a. Dangerous piping into shell (e.g. curl ... | sh, wget ... | bash, etc.)
    if re.search(r"(?:curl|wget)\b.*\|\s*(?:ba|z)?sh\b", clean_cmd, re.IGNORECASE) or \
       re.search(r"curl\s*\|\s*(?:ba|z)?sh", clean_cmd, re.IGNORECASE):
        return PolicyDecision(RiskLevel.BLOCKED, "Dangerous piped shell execution (curl|sh) blocked")

    # 1b. Recursive force deletion (rm -rf, rm -fr, etc.)
    if re.search(r"\brm\s+-[a-zA-Z]*r[a-zA-Z]*f\b|\brm\s+-[a-zA-Z]*f[a-zA-Z]*r\b|\brm\s+.*-r.*-f\b", clean_cmd):
        return PolicyDecision(RiskLevel.BLOCKED, "Dangerous recursive deletion (rm -rf) blocked")

    # 1c. Sudo escalation
    if re.search(r"\bsudo\b", clean_cmd):
        return PolicyDecision(RiskLevel.BLOCKED, "Superuser privilege escalation (sudo) blocked")

    # 1d. Sensitive files mentioned anywhere in raw command
    for word in re.split(r"[\s\"'=`><|;&]+", clean_cmd):
        if word and _is_sensitive_file(word):
            return PolicyDecision(RiskLevel.BLOCKED, f"Access to sensitive/credential file blocked: {word}")

    # Inspect each segment of a compound command
    subcommands = _split_subcommands(clean_cmd)
    max_risk = RiskLevel.LOW
    max_risk_reason = "Read-only command inside workspace"

    def _escalate(risk: RiskLevel, reason: str) -> None:
        nonlocal max_risk, max_risk_reason
        risk_rank = {RiskLevel.LOW: 1, RiskLevel.MEDIUM: 2, RiskLevel.HIGH: 3, RiskLevel.BLOCKED: 4}
        if risk_rank[risk] > risk_rank[max_risk]:
            max_risk = risk
            max_risk_reason = reason

    # Check path redirection operators in the command (e.g., > output.txt, >> append.txt)
    redirect_matches = re.findall(r"(?:>>|>)\s*([^\s;&|]+)", clean_cmd)
    for target in redirect_matches:
        is_safe, err = _check_path_safety(target, ws_root)
        if not is_safe:
            return PolicyDecision(RiskLevel.BLOCKED, err)
        if _is_config_file(target):
            _escalate(RiskLevel.HIGH, f"Modifying configuration file via redirection: {target}")
        else:
            _escalate(RiskLevel.MEDIUM, f"File write redirection inside workspace: {target}")

    for sub in subcommands:
        try:
            tokens = shlex.split(sub)
        except ValueError:
            # Malformed shell syntax defaults to HIGH or BLOCKED
            return PolicyDecision(RiskLevel.HIGH, "Malformed shell command syntax")

        if not tokens:
            continue

        exe = tokens[0]
        args = tokens[1:]

        # Validate path arguments for traversal, symlink escapes, or sensitive file access
        for arg in args:
            # Skip flags like -v, --all, origin, etc.
            if arg.startswith("-") and not (arg.startswith("./") or arg.startswith("../")):
                continue

            # Check if arg looks like a file path or contains path separators
            if "/" in arg or "\\" in arg or arg.startswith(".") or os.path.exists(ws_root / arg):
                is_safe, err = _check_path_safety(arg, ws_root)
                if not is_safe:
                    return PolicyDecision(RiskLevel.BLOCKED, err)

        # Check git commands
        if exe == "git":
            if not args:
                _escalate(RiskLevel.LOW, "git status/info")
                continue
            git_sub = args[0]
            if git_sub == "push":
                _escalate(RiskLevel.HIGH, "git push requires approval")
            elif git_sub in {"status", "diff", "log", "branch", "show"}:
                _escalate(RiskLevel.LOW, f"git {git_sub} is read-only")
            elif git_sub in {"add", "commit"}:
                # If git add touches config files -> HIGH
                touching_config = any(_is_config_file(a) for a in args[1:])
                if touching_config:
                    _escalate(RiskLevel.HIGH, f"git {git_sub} touches configuration file")
                else:
                    _escalate(RiskLevel.MEDIUM, f"git {git_sub} modifies repository state")
            elif git_sub in {"rm"}:
                _escalate(RiskLevel.HIGH, "git rm deletes files")
            else:
                _escalate(RiskLevel.HIGH, f"Unknown git command: git {git_sub}")
            continue

        # Check read-only commands
        if exe in {"ls", "cat", "find", "grep", "rg", "head", "tail", "wc", "pwd"}:
            _escalate(RiskLevel.LOW, f"Read-only command: {exe}")
            continue

        # Check test runners
        if exe == "pytest" or (exe in {"python", "python3"} and len(args) >= 2 and args[0] == "-m" and args[1] == "pytest"):
            _escalate(RiskLevel.LOW, "Test runner: pytest")
            continue

        if exe == "npm" and args and args[0] == "test":
            _escalate(RiskLevel.LOW, "Test runner: npm test")
            continue

        # Check echo / printf (without redirection)
        if exe in {"echo", "printf"}:
            _escalate(RiskLevel.LOW, "Echo command without writes")
            continue

        # Check file writes inside workspace
        if exe in {"touch", "mkdir", "cp", "mv"}:
            # Check if touching config file
            touching_config = any(_is_config_file(a) for a in args)
            if touching_config:
                _escalate(RiskLevel.HIGH, f"{exe} touches configuration file")
            else:
                _escalate(RiskLevel.MEDIUM, f"File write operation inside workspace: {exe}")
            continue

        # Check package installations
        is_pkg_install = False
        for cmd_bin, sub_arg in _INSTALL_PREFIXES:
            if exe == cmd_bin and args and args[0] == sub_arg:
                _escalate(RiskLevel.MEDIUM, f"Package installation: {exe} {sub_arg}")
                is_pkg_install = True
                break
        if is_pkg_install:
            continue

        # Check deleting files
        if exe in {"rm", "unlink", "rmdir"}:
            _escalate(RiskLevel.HIGH, f"Deleting files: {exe}")
            continue

        # Check network calls
        if exe in _NETWORK_COMMANDS:
            _escalate(RiskLevel.HIGH, f"Network call: {exe}")
            continue

        # Unknown commands default to HIGH, never LOW
        _escalate(RiskLevel.HIGH, f"Unknown command defaults to HIGH: {exe}")

    return PolicyDecision(max_risk, max_risk_reason)

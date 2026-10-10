"""Advisory engine for SŪTRA: Gemma via Ollama with rule-based fallback."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Optional
import httpx

from sutra.config import settings
from sutra.db import Database
from sutra.events import EventBus, EventType
from sutra.policy import sanitize_secrets


class AdvisoryEngine:
    """Provides advisory summaries using local LLM (Gemma via Ollama) or rule-based fallback."""

    def __init__(self, db: Database, event_bus: EventBus) -> None:
        self.db = db
        self.event_bus = event_bus

    def check_heuristics(self, logs: list[dict[str, Any]]) -> dict[str, Any]:
        """Detect looping commands and stuck execution."""
        is_looping = False
        looping_cmd = None
        is_stuck = False
        time_since_last_sec = 0.0

        if not logs:
            return {"is_looping": False, "is_stuck": False, "details": "No logs recorded"}

        # 1. Loop detection: check consecutive identical commands
        commands = [entry.get("command") for entry in logs if entry.get("command")]
        if len(commands) >= 3:
            for i in range(len(commands) - 2):
                if commands[i] == commands[i + 1] == commands[i + 2]:
                    is_looping = True
                    looping_cmd = commands[i]
                    break

        # 2. Stuck detection: check time elapsed since last activity
        latest_entry = logs[-1]
        latest_ts = latest_entry.get("timestamp")
        if latest_ts:
            try:
                # Parse ISO timestamp
                ts_dt = datetime.fromisoformat(latest_ts.replace("Z", "+00:00"))
                now_dt = datetime.now(timezone.utc)
                time_since_last_sec = (now_dt - ts_dt).total_seconds()
                if time_since_last_sec > 300.0:  # > 5 minutes of inactivity
                    is_stuck = True
            except Exception:
                pass

        return {
            "is_looping": is_looping,
            "looping_command": looping_cmd,
            "is_stuck": is_stuck,
            "inactive_seconds": time_since_last_sec,
        }

    async def get_summary(self, max_lines: int = 50) -> str:
        """Fetch last 50 sanitized log lines, query Gemma, or fall back to rule-based."""
        recent_logs = self.db.get_recent_log_lines(limit=max_lines)
        if not recent_logs:
            return "No activity logs recorded yet."

        heuristics = self.check_heuristics(recent_logs)
        is_stuck = heuristics["is_stuck"]
        is_looping = heuristics["is_looping"]

        # Format sanitized log snippet
        log_lines = []
        for entry in recent_logs:
            ts = entry.get("timestamp", "").split("T")[-1][:8]
            t = entry.get("type", "")
            cmd = entry.get("command") or ""
            dec = entry.get("decision") or ""
            line = f"[{ts}] {t} | {cmd} | {dec}".strip()
            log_lines.append(sanitize_secrets(line))

        logs_text = "\n".join(log_lines[-max_lines:])

        # Attempt Ollama call
        ollama_url = settings.OLLAMA_URL.rstrip("/")
        model = settings.OLLAMA_MODEL
        summary_result = ""
        provider = "ollama"

        prompt = (
            f"You are SŪTRA's advisory assistant. Review these sanitized agent activity logs.\n"
            f"Provide a concise 3-line summary of what the agent has accomplished, current status, and next step.\n"
            f"Then state if the agent looks stuck (idle) or looping.\n"
            f"Logs:\n{logs_text}\n\nSummary:"
        )

        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                res = await client.post(
                    f"{ollama_url}/api/generate",
                    json={"model": model, "prompt": prompt, "stream": False},
                )
                if res.status_code == 200:
                    data = res.json()
                    summary_result = data.get("response", "").strip()
        except Exception:
            # Fall back to rule-based summary
            provider = "rule_based"

        if not summary_result:
            provider = "rule_based"
            stuck_str = "⚠️ STUCK: Inactive for >5 min" if is_stuck else "Active (no inactivity detected)"
            loop_str = f"⚠️ LOOPING: Repeated command '{heuristics.get('looping_command')}'" if is_looping else "Normal progression (no loop)"
            
            recent_types = [e.get("type") for e in recent_logs[-5:]]
            summary_result = (
                "ℹ️ *Rule-based Advisory* (Ollama unreachable):\n"
                f"• Processed {len(recent_logs)} audit events; recent phases: {', '.join(recent_types)}.\n"
                f"• Execution Health: {stuck_str}.\n"
                f"• Progression Check: {loop_str}."
            )

        sanitized_summary = sanitize_secrets(summary_result)

        # Log audit record for advisory call (Gemma output NEVER executes anything)
        self.db.append_audit(
            event_type="ADVISORY",
            risk="LOW",
            command=None,
            decision=None,
            actor="advisory_engine",
            payload={
                "provider": provider,
                "is_stuck": is_stuck,
                "is_looping": is_looping,
                "summary": sanitized_summary[:200],
            },
        )
        await self.event_bus.publish(
            EventType.ADVISORY,
            {"provider": provider, "summary": sanitized_summary},
        )

        return sanitized_summary

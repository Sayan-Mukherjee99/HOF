"""Seed script for running the interactive SŪTRA demo task."""

from __future__ import annotations

import asyncio
import sys

from sutra.advisory import AdvisoryEngine
from sutra.agent import MockAdapter
from sutra.approval import ApprovalManager
from sutra.channels import Channel, ConsoleChannel, TelegramChannel
from sutra.config import settings
from sutra.db import Database
from sutra.events import event_bus


async def run_seed() -> None:
    print("=" * 60)
    print("🚀 SŪTRA SUPERVISION DEMO SEED")
    print("=" * 60)

    db = Database(settings.DATABASE_PATH)
    approval_manager = ApprovalManager(db=db, event_bus=event_bus)
    agent = MockAdapter(
        approval_manager=approval_manager,
        event_bus=event_bus,
        workspace_root=settings.workspace_path,
    )
    advisory_engine = AdvisoryEngine(db=db, event_bus=event_bus)

    # Initialize Channel
    channel: Channel
    if settings.BOT_TOKEN:
        print("[SŪTRA] BOT_TOKEN found. Starting TelegramChannel for remote supervision.")
        channel = TelegramChannel(
            bot_token=settings.BOT_TOKEN,
            db=db,
            advisory_engine=advisory_engine,
            agent_ref=agent,
        )
    else:
        print("[SŪTRA] BOT_TOKEN is missing in .env. Starting with ConsoleChannel.")
        channel = ConsoleChannel()

    approval_manager.set_channel(channel)

    # Attach callbacks
    async def _on_decision(approval_id: str, decision: str, actor: str) -> None:
        await approval_manager.submit_decision(approval_id, decision, actor)

    async def _on_command(cmd_type: str, arg: str) -> None:
        if cmd_type == "pause":
            await agent.pause()
        elif cmd_type == "resume":
            await agent.resume()
        elif cmd_type == "stop":
            await agent.stop()
        elif cmd_type == "steer":
            await agent.steer(arg)

    channel.on_decision(_on_decision)
    channel.on_command(_on_command)

    await channel.start()

    task_desc = "Demonstrate autonomous coding agent supervision & approval barriers"
    print(f"\n[DEMO] Starting MockAgent task: '{task_desc}'\n")
    await agent.start(task_desc)

    # Wait for the agent to finish its scripted task
    while agent.status not in {"COMPLETED", "STOPPED"}:
        await asyncio.sleep(0.5)

    print("\n" + "=" * 60)
    print("📋 AUDIT TABLE SUMMARY (Recent Entries from SQLite WAL)")
    print("=" * 60)
    audit_entries = db.get_recent_log_lines(limit=10)
    for entry in audit_entries:
        ts = entry.get("timestamp", "").split("T")[-1][:8]
        t = entry.get("type")
        risk = entry.get("risk") or "-"
        cmd = entry.get("command") or "-"
        dec = entry.get("decision") or "-"
        actor = entry.get("actor") or "-"
        print(f"[{ts}] {t:<18} | Risk: {risk:<7} | Decision: {dec:<12} | Actor: {actor:<14} | Cmd: {cmd}")

    print("=" * 60)
    print("Demo execution finished.")
    await channel.stop()


def main() -> None:
    try:
        asyncio.run(run_seed())
    except KeyboardInterrupt:
        print("\n[DEMO] Interrupted by user.")
        sys.exit(0)


if __name__ == "__main__":
    main()

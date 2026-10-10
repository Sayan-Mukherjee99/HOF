"""Main application entry point for SŪTRA."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from sutra.advisory import AdvisoryEngine
from sutra.agent import MockAdapter
from sutra.api import create_app
from sutra.approval import ApprovalManager
from sutra.channels import Channel, ConsoleChannel, TelegramChannel
from sutra.config import settings
from sutra.db import Database
from sutra.events import event_bus

# Shared singletons
db = Database(settings.DATABASE_PATH)
approval_manager = ApprovalManager(db=db, event_bus=event_bus)
agent = MockAdapter(
    approval_manager=approval_manager,
    event_bus=event_bus,
    workspace_root=settings.workspace_path,
)
advisory_engine = AdvisoryEngine(db=db, event_bus=event_bus)

# Channel selection
channel: Channel
if settings.BOT_TOKEN:
    print("[SŪTRA] BOT_TOKEN detected. Initializing TelegramChannel (long polling)...")
    channel = TelegramChannel(
        bot_token=settings.BOT_TOKEN,
        db=db,
        advisory_engine=advisory_engine,
        agent_ref=agent,
    )
else:
    print("[SŪTRA] BOT_TOKEN is missing in .env. Starting with ConsoleChannel for terminal supervision.")
    channel = ConsoleChannel()

# Attach channel to approval manager
approval_manager.set_channel(channel)

# Wire channel callbacks
async def _on_channel_decision(approval_id: str, decision: str, actor: str) -> None:
    await approval_manager.submit_decision(approval_id, decision, actor)

async def _on_channel_command(cmd_type: str, arg: str) -> None:
    if cmd_type == "pause":
        await agent.pause()
    elif cmd_type == "resume":
        await agent.resume()
    elif cmd_type == "stop":
        await agent.stop()
    elif cmd_type == "steer":
        await agent.steer(arg)

channel.on_decision(_on_channel_decision)
channel.on_command(_on_channel_command)


@asynccontextmanager
async def lifespan(app_instance: Any) -> AsyncGenerator[None, None]:
    """Application lifecycle context manager."""
    print("[SŪTRA] Starting backend services...")
    await channel.start()
    yield
    print("[SŪTRA] Shutting down backend services...")
    await channel.stop()


# Create FastAPI application
app = create_app(
    db=db,
    event_bus=event_bus,
    approval_manager=approval_manager,
    agent=agent,
)
app.router.lifespan_context = lifespan

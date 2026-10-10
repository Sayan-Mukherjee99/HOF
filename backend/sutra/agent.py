"""Agent adapters and MockAgent for SŪTRA."""

from __future__ import annotations

import asyncio
from abc import ABC, abstractmethod
from enum import Enum
from pathlib import Path
from typing import Optional

from sutra.approval import ApprovalManager
from sutra.events import EventBus, EventType
from sutra.policy import sanitize_secrets


class AgentStatus(str, Enum):
    IDLE = "IDLE"
    RUNNING = "RUNNING"
    PAUSED = "PAUSED"
    STOPPED = "STOPPED"
    COMPLETED = "COMPLETED"


class AgentAdapter(ABC):
    """Abstract base class for coding agent adapters."""

    @abstractmethod
    async def start(self, task: str) -> None:
        """Start the agent on a specific task."""
        pass

    @abstractmethod
    async def pause(self) -> None:
        """Pause agent execution."""
        pass

    @abstractmethod
    async def resume(self) -> None:
        """Resume agent execution."""
        pass

    @abstractmethod
    async def stop(self) -> None:
        """Stop agent execution permanently."""
        pass

    @abstractmethod
    async def steer(self, text: str) -> None:
        """Provide mid-flight steering instructions."""
        pass

    @abstractmethod
    async def on_permission_decision(self, approval_id: str, decision: str) -> None:
        """Notification hook when a permission decision resolves."""
        pass


class ClaudeCodeAdapter(AgentAdapter):
    """Empty stub for Claude Code integration."""

    async def start(self, task: str) -> None:
        raise NotImplementedError("ClaudeCodeAdapter is a stub")

    async def pause(self) -> None:
        raise NotImplementedError("ClaudeCodeAdapter is a stub")

    async def resume(self) -> None:
        raise NotImplementedError("ClaudeCodeAdapter is a stub")

    async def stop(self) -> None:
        raise NotImplementedError("ClaudeCodeAdapter is a stub")

    async def steer(self, text: str) -> None:
        raise NotImplementedError("ClaudeCodeAdapter is a stub")

    async def on_permission_decision(self, approval_id: str, decision: str) -> None:
        raise NotImplementedError("ClaudeCodeAdapter is a stub")


class CursorAdapter(AgentAdapter):
    """Empty stub for Cursor agent integration."""

    async def start(self, task: str) -> None:
        raise NotImplementedError("CursorAdapter is a stub")

    async def pause(self) -> None:
        raise NotImplementedError("CursorAdapter is a stub")

    async def resume(self) -> None:
        raise NotImplementedError("CursorAdapter is a stub")

    async def stop(self) -> None:
        raise NotImplementedError("CursorAdapter is a stub")

    async def steer(self, text: str) -> None:
        raise NotImplementedError("CursorAdapter is a stub")

    async def on_permission_decision(self, approval_id: str, decision: str) -> None:
        raise NotImplementedError("CursorAdapter is a stub")


class GenericCLIAdapter(AgentAdapter):
    """Empty stub for Generic CLI agent integration."""

    async def start(self, task: str) -> None:
        raise NotImplementedError("GenericCLIAdapter is a stub")

    async def pause(self) -> None:
        raise NotImplementedError("GenericCLIAdapter is a stub")

    async def resume(self) -> None:
        raise NotImplementedError("GenericCLIAdapter is a stub")

    async def stop(self) -> None:
        raise NotImplementedError("GenericCLIAdapter is a stub")

    async def steer(self, text: str) -> None:
        raise NotImplementedError("GenericCLIAdapter is a stub")

    async def on_permission_decision(self, approval_id: str, decision: str) -> None:
        raise NotImplementedError("GenericCLIAdapter is a stub")


class MockAdapter(AgentAdapter):
    """Scripted mock agent demonstrating SŪTRA supervision flows.

    Demos all risk levels:
    - LOW: ls / pytest (auto-approved)
    - MEDIUM: git add backend/parser.py (requests approval)
    - BLOCKED: cat ../../.env (blocked immediately, never shown to user)
    - HIGH: git push origin main (requests approval, no session allow)
    """

    def __init__(
        self,
        approval_manager: ApprovalManager,
        event_bus: EventBus,
        workspace_root: str | Path = ".",
    ) -> None:
        self.approval_manager = approval_manager
        self.event_bus = event_bus
        self.workspace_root = Path(workspace_root).resolve()
        self.status = AgentStatus.IDLE
        self.current_task: Optional[str] = None
        self._task_coro: Optional[asyncio.Task[None]] = None
        self._pause_event = asyncio.Event()
        self._pause_event.set()  # Unpaused initially

    async def _emit_log(self, message: str) -> None:
        clean = sanitize_secrets(message)
        print(f"[MOCK AGENT LOG] {clean}")
        await self.event_bus.publish(EventType.LOG, {"message": clean})

    async def _emit_progress(self, percent: int, stage: str) -> None:
        print(f"[MOCK AGENT PROGRESS] {percent}% - {stage}")
        await self.event_bus.publish(EventType.PROGRESS, {"percent": percent, "stage": stage})

    async def _wait_if_paused(self) -> None:
        await self._pause_event.wait()

    async def start(self, task: str) -> None:
        """Start scripted async workflow."""
        if self.status == AgentStatus.RUNNING:
            return

        self.current_task = task
        self.status = AgentStatus.RUNNING
        self._pause_event.set()
        await self.event_bus.publish(EventType.AGENT_STARTED, {"task": task})

        # Launch background execution task
        self._task_coro = asyncio.create_task(self._run_scripted_task())

    async def pause(self) -> None:
        """Pause execution."""
        if self.status == AgentStatus.RUNNING:
            self.status = AgentStatus.PAUSED
            self._pause_event.clear()
            await self.event_bus.publish(EventType.AGENT_PAUSED, {})

    async def resume(self) -> None:
        """Resume execution."""
        if self.status == AgentStatus.PAUSED:
            self.status = AgentStatus.RUNNING
            self._pause_event.set()
            await self.event_bus.publish(EventType.AGENT_RESUMED, {})

    async def stop(self) -> None:
        """Stop execution."""
        self.status = AgentStatus.STOPPED
        self._pause_event.set()
        if self._task_coro and not self._task_coro.done():
            self._task_coro.cancel()
        await self.event_bus.publish(EventType.AGENT_STOPPED, {"reason": "Manual stop"})

    async def steer(self, text: str) -> None:
        """Steer agent behavior mid-flight."""
        clean = sanitize_secrets(text)
        await self._emit_log(f"Received steering guidance: '{clean}'")
        await self.event_bus.publish(EventType.STEER, {"guidance": clean})

    async def on_permission_decision(self, approval_id: str, decision: str) -> None:
        """Hook called when approval resolves."""
        pass

    async def _run_scripted_task(self) -> None:
        """Run the scripted multi-step demo workflow."""
        try:
            await self._wait_if_paused()
            await self._emit_log(f"Starting task: {self.current_task}")
            await self._emit_progress(10, "Initializing workspace")
            await asyncio.sleep(0.5)

            # Step 1: Read-only command (LOW risk - auto-approved)
            await self._wait_if_paused()
            await self._emit_log("Scanning code repository: ls")
            decision_low = await self.approval_manager.request_approval("ls", self.workspace_root)
            await self._emit_log(f"Result for 'ls': {decision_low}")
            await self._emit_progress(25, "Repository indexed")
            await asyncio.sleep(0.5)

            # Step 2: MEDIUM risk command (git add backend/parser.py - requires approval)
            await self._wait_if_paused()
            cmd_medium = "git add backend/parser.py"
            await self._emit_log(f"Staging file changes: {cmd_medium}")
            decision_med = await self.approval_manager.request_approval(cmd_medium, self.workspace_root)
            if decision_med in {"ALLOW_ONCE", "ALLOW_SESSION", "ALLOW_AUTO"}:
                await self._emit_log(f"Changes staged successfully ({decision_med})")
            else:
                await self._emit_log(f"Skipping {cmd_medium} due to {decision_med} decision")
            await self._emit_progress(50, "Staging completed")
            await asyncio.sleep(0.5)

            # Step 3: BLOCKED command (cat ../../.env - blocked by policy engine immediately)
            await self._wait_if_paused()
            cmd_blocked = "cat ../../.env"
            await self._emit_log(f"Agent attempting environment inspection: {cmd_blocked}")
            decision_blocked = await self.approval_manager.request_approval(cmd_blocked, self.workspace_root)
            await self._emit_log(f"Execution response: {decision_blocked} (Blocked by safety policy)")
            await self._emit_progress(75, "Security validation checked")
            await asyncio.sleep(0.5)

            # Step 4: HIGH risk command (git push origin main - requires approval, no session allow)
            await self._wait_if_paused()
            cmd_high = "git push origin main"
            await self._emit_log(f"Preparing to push changes: {cmd_high}")
            decision_high = await self.approval_manager.request_approval(cmd_high, self.workspace_root)
            if decision_high in {"ALLOW_ONCE", "ALLOW_AUTO"}:
                await self._emit_log(f"Push completed successfully ({decision_high})")
            else:
                await self._emit_log(f"Push skipped ({decision_high})")
            await self._emit_progress(100, "All stages finished")

            self.status = AgentStatus.COMPLETED
            await self._emit_log("Mock task completed successfully.")
            await self.event_bus.publish(EventType.AGENT_STOPPED, {"status": "COMPLETED"})

        except asyncio.CancelledError:
            self.status = AgentStatus.STOPPED
            await self._emit_log("Task execution was cancelled.")
        except Exception as exc:
            self.status = AgentStatus.STOPPED
            await self.event_bus.publish(EventType.ERROR, {"error": str(exc)})
            await self._emit_log(f"Task encountered unexpected error: {exc}")

"""In-process asynchronous event bus for SŪTRA."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable, Coroutine
from uuid import uuid4
from pydantic import BaseModel, Field

from sutra.policy import sanitize_secrets


class EventType(str, Enum):
    AGENT_STARTED = "AGENT_STARTED"
    PROGRESS = "PROGRESS"
    LOG = "LOG"
    PERMISSION_REQUIRED = "PERMISSION_REQUIRED"
    DECISION = "DECISION"
    AGENT_PAUSED = "AGENT_PAUSED"
    AGENT_RESUMED = "AGENT_RESUMED"
    AGENT_STOPPED = "AGENT_STOPPED"
    STEER = "STEER"
    ERROR = "ERROR"
    ADVISORY = "ADVISORY"


def _sanitize_obj(obj: Any) -> Any:
    """Recursively sanitize string values in any object."""
    if isinstance(obj, str):
        return sanitize_secrets(obj)
    if isinstance(obj, dict):
        return {k: _sanitize_obj(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize_obj(x) for x in obj]
    return obj


class Event(BaseModel):
    """Event representation emitted across the system."""
    id: str = Field(default_factory=lambda: str(uuid4()))
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    type: EventType
    payload: dict[str, Any] = Field(default_factory=dict)


EventHandler = Callable[[Event], Coroutine[Any, Any, None]]


class EventBus:
    """Thread-safe, asynchronous in-process event bus."""

    def __init__(self) -> None:
        self._subscribers: list[EventHandler] = []
        self._lock = asyncio.Lock()

    async def subscribe(self, handler: EventHandler) -> None:
        """Register an async event subscriber."""
        async with self._lock:
            if handler not in self._subscribers:
                self._subscribers.append(handler)

    async def unsubscribe(self, handler: EventHandler) -> None:
        """Unregister an async event subscriber."""
        async with self._lock:
            if handler in self._subscribers:
                self._subscribers.remove(handler)

    async def publish(self, event_or_type: Event | EventType, payload: dict[str, Any] | None = None) -> Event:
        """Publish an event to all subscribers after sanitizing secrets."""
        if isinstance(event_or_type, Event):
            event = event_or_type
            clean_payload = _sanitize_obj(event.payload)
            event = Event(id=event.id, timestamp=event.timestamp, type=event.type, payload=clean_payload)
        else:
            clean_payload = _sanitize_obj(payload or {})
            event = Event(type=event_or_type, payload=clean_payload)

        async with self._lock:
            handlers = list(self._subscribers)

        for handler in handlers:
            try:
                # Schedule handler execution concurrently
                asyncio.create_task(handler(event))
            except Exception as exc:
                print(f"[EVENT BUS] Handler failed for {event.type}: {exc}")

        return event


# Global shared event bus instance
event_bus = EventBus()

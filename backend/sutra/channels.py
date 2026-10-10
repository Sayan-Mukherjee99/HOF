"""Communication channels for SŪTRA: ConsoleChannel and TelegramChannel."""

from __future__ import annotations

import asyncio
import sys
from abc import ABC, abstractmethod
from typing import Any, Callable, Coroutine, Optional

from sutra.advisory import AdvisoryEngine
from sutra.approval import ApprovalRequest, DecisionType
from sutra.config import settings
from sutra.db import Database
from sutra.policy import RiskLevel, sanitize_secrets

DecisionCallback = Callable[[str, str, str], Coroutine[Any, Any, None]]
CommandCallback = Callable[[str, str], Coroutine[Any, Any, None]]


class Channel(ABC):
    """Abstract interface for supervisor communication channels."""

    def __init__(self) -> None:
        self._decision_callback: Optional[DecisionCallback] = None
        self._command_callback: Optional[CommandCallback] = None

    def on_decision(self, callback: DecisionCallback) -> None:
        """Register callback for approval decisions: (approval_id, decision, actor)."""
        self._decision_callback = callback

    def on_command(self, callback: CommandCallback) -> None:
        """Register callback for agent commands: (command_type, argument)."""
        self._command_callback = callback

    @abstractmethod
    async def send_message(self, text: str) -> None:
        """Send a notification message through the channel."""
        pass

    @abstractmethod
    async def send_approval_request(self, approval: ApprovalRequest) -> None:
        """Send an interactive approval request to the remote supervisor."""
        pass

    @abstractmethod
    async def start(self) -> None:
        """Start channel listeners."""
        pass

    @abstractmethod
    async def stop(self) -> None:
        """Stop channel listeners."""
        pass


# ============================================================================
# CONSOLE CHANNEL
# ============================================================================

class ConsoleChannel(Channel):
    """Interactive terminal channel using standard input and output."""

    def __init__(self) -> None:
        super().__init__()
        self._running = False
        self._active_requests: dict[str, ApprovalRequest] = {}

    async def start(self) -> None:
        self._running = True
        print("[SŪTRA] ConsoleChannel initialized. Ready for interactive supervision.")

    async def stop(self) -> None:
        self._running = False

    async def send_message(self, text: str) -> None:
        clean = sanitize_secrets(text)
        print(f"\n[SŪTRA NOTIFICATION] {clean}")

    async def send_approval_request(self, approval: ApprovalRequest) -> None:
        clean_cmd = sanitize_secrets(approval.command)
        clean_reason = sanitize_secrets(approval.reason)
        self._active_requests[approval.id] = approval

        prompt_str = (
            f"\n"
            f"============================================================\n"
            f"⚠️  PERMISSION REQUIRED\n"
            f"Command:     {clean_cmd}\n"
            f"Risk Level:  {approval.risk}\n"
            f"Reason:      {clean_reason}\n"
            f"Expires In:  120s\n"
            f"Decision?    [y] Allow once  |  [s] Allow session  |  [n] Deny: \n"
            f"============================================================\n"
        )
        print(prompt_str, end="", flush=True)

        # Handle user input in background thread without blocking async loop
        asyncio.create_task(self._prompt_user(approval))

    async def _prompt_user(self, approval: ApprovalRequest) -> None:
        loop = asyncio.get_event_loop()
        try:
            choice = await loop.run_in_executor(None, sys.stdin.readline)
            if not choice:
                return
            choice_clean = choice.strip().lower()

            decision = DecisionType.DENY.value
            if choice_clean == "y":
                decision = DecisionType.ALLOW_ONCE.value
            elif choice_clean == "s":
                if approval.risk == RiskLevel.HIGH:
                    print("⚠️ Session allow not permitted for HIGH risk commands. Defaulting to ALLOW_ONCE.")
                    decision = DecisionType.ALLOW_ONCE.value
                else:
                    decision = DecisionType.ALLOW_SESSION.value
            elif choice_clean == "n":
                decision = DecisionType.DENY.value

            self._active_requests.pop(approval.id, None)
            if self._decision_callback:
                await self._decision_callback(approval.id, decision, "console_user")

        except Exception as exc:
            print(f"[CONSOLE] Error reading approval input: {exc}")


# ============================================================================
# TELEGRAM CHANNEL (aiogram 3, Long Polling Only)
# ============================================================================

class TelegramChannel(Channel):
    """Remote supervision channel via Telegram Bot using aiogram 3 long polling."""

    def __init__(
        self,
        bot_token: str,
        db: Database,
        advisory_engine: Optional[AdvisoryEngine] = None,
        agent_ref: Any = None,
    ) -> None:
        super().__init__()
        self.bot_token = bot_token
        self.db = db
        self.advisory_engine = advisory_engine
        self.agent_ref = agent_ref
        self._seen_unknown_chats: set[int] = set()
        self._approval_messages: dict[str, int] = {}  # approval_id -> message_id
        self._polling_task: Optional[asyncio.Task[None]] = None
        self._bot: Any = None
        self._dp: Any = None

    async def send_message(self, text: str) -> None:
        """Send sanitized notification to paired chat."""
        chat_id = self.db.get_paired_chat_id()
        if not chat_id or not self._bot:
            return

        clean = sanitize_secrets(text)
        try:
            await self._bot.send_message(chat_id=chat_id, text=clean)
        except Exception as exc:
            print(f"[TELEGRAM] Failed to send message: {exc}")

    async def send_approval_request(self, approval: ApprovalRequest) -> None:
        """Send interactive permission card with inline buttons to paired supervisor."""
        chat_id = self.db.get_paired_chat_id()
        if not chat_id or not self._bot:
            print(f"[TELEGRAM] Approval {approval.id} pending, but no paired Telegram chat is active.")
            return

        from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

        clean_cmd = sanitize_secrets(approval.command)
        clean_reason = sanitize_secrets(approval.reason)

        text = (
            f"⚠️ *PERMISSION REQUIRED*\n\n"
            f"```bash\n{clean_cmd}\n```\n"
            f"• *Risk Level:* `{approval.risk}`\n"
            f"• *Reason:* {clean_reason}\n"
            f"• *Expiry:* 120 seconds"
        )
        sanitized_text = sanitize_secrets(text)

        # Buttons carry ONLY the action and approval id: action:{id}
        buttons = [
            InlineKeyboardButton(text="✅ Allow once", callback_data=f"once:{approval.id}"),
        ]
        # HIGH risk hides "Allow session"
        if approval.risk != RiskLevel.HIGH:
            buttons.append(
                InlineKeyboardButton(text="🔁 Allow session", callback_data=f"session:{approval.id}")
            )
        buttons.append(
            InlineKeyboardButton(text="❌ Deny", callback_data=f"deny:{approval.id}")
        )

        keyboard = InlineKeyboardMarkup(inline_keyboard=[buttons])

        try:
            msg = await self._bot.send_message(
                chat_id=chat_id,
                text=sanitized_text,
                parse_mode="Markdown",
                reply_markup=keyboard,
            )
            self._approval_messages[approval.id] = msg.message_id
        except Exception as exc:
            print(f"[TELEGRAM] Failed to send approval card: {exc}")

    async def start(self) -> None:
        """Start aiogram long polling (outbound only, no webhooks, no public ports)."""
        from aiogram import Bot, Dispatcher, F
        from aiogram.types import CallbackQuery, Message

        self._bot = Bot(token=self.bot_token)
        self._dp = Dispatcher()

        # --------------------------------------------------------------------
        # PAIRING & ACCESS CONTROL MIDDLEWARE / FILTER
        # --------------------------------------------------------------------
        @self._dp.message(F.text.startswith("/pair"))
        async def handle_pair(message: Message) -> None:
            parts = (message.text or "").split(maxsplit=1)
            if len(parts) < 2:
                await message.answer("Usage: `/pair <CODE>`", parse_mode="Markdown")
                return

            code = parts[1].strip()
            username = message.from_user.username if message.from_user else None
            success = self.db.verify_and_pair(code, message.chat.id, username=username)
            if success:
                await message.answer(
                    "✅ *Successfully paired with SŪTRA!*\n"
                    "This chat is now the authorized supervisor for the local coding agent.\n"
                    "Type /help to view available commands.",
                    parse_mode="Markdown",
                )
            else:
                await message.answer("❌ Invalid or expired pairing code. Codes expire after 5 minutes.")

        @self._dp.message(F.text == "/unpair")
        async def handle_unpair(message: Message) -> None:
            if not self.db.is_chat_allowed(message.chat.id):
                return
            self.db.unpair()
            await message.answer("🚪 Unpaired successfully. Remote access revoked.")

        # --------------------------------------------------------------------
        # PAIRED COMMAND HANDLERS
        # --------------------------------------------------------------------
        @self._dp.message(F.text == "/status")
        async def handle_status(message: Message) -> None:
            if not self.db.is_chat_allowed(message.chat.id):
                self._check_unauthorized(message)
                return

            status = getattr(self.agent_ref, "status", "UNKNOWN")
            task = getattr(self.agent_ref, "current_task", "None")
            rep = (
                f"🤖 *SŪTRA Supervisor Status*\n"
                f"• Agent State: `{status}`\n"
                f"• Active Task: `{task}`\n"
                f"• Chat Paired: ✅ Yes (`{message.chat.id}`)"
            )
            await message.answer(sanitize_secrets(rep), parse_mode="Markdown")

        @self._dp.message(F.text == "/pause")
        async def handle_pause(message: Message) -> None:
            if not self.db.is_chat_allowed(message.chat.id):
                self._check_unauthorized(message)
                return
            if self._command_callback:
                await self._command_callback("pause", "")
            await message.answer("⏸ Agent paused.")

        @self._dp.message(F.text == "/resume")
        async def handle_resume(message: Message) -> None:
            if not self.db.is_chat_allowed(message.chat.id):
                self._check_unauthorized(message)
                return
            if self._command_callback:
                await self._command_callback("resume", "")
            await message.answer("▶️ Agent resumed.")

        @self._dp.message(F.text == "/stop")
        async def handle_stop(message: Message) -> None:
            if not self.db.is_chat_allowed(message.chat.id):
                self._check_unauthorized(message)
                return
            if self._command_callback:
                await self._command_callback("stop", "")
            await message.answer("⏹ Agent stopped.")

        @self._dp.message(F.text.startswith("/steer"))
        async def handle_steer(message: Message) -> None:
            if not self.db.is_chat_allowed(message.chat.id):
                self._check_unauthorized(message)
                return
            parts = (message.text or "").split(maxsplit=1)
            if len(parts) < 2:
                await message.answer("Usage: `/steer <instructions>`", parse_mode="Markdown")
                return
            guidance = parts[1].strip()
            if self._command_callback:
                await self._command_callback("steer", guidance)
            clean_g = sanitize_secrets(guidance)
            await message.answer(f"🎯 Steering guidance dispatched: `{clean_g}`", parse_mode="Markdown")

        @self._dp.message(F.text == "/log")
        async def handle_log(message: Message) -> None:
            if not self.db.is_chat_allowed(message.chat.id):
                self._check_unauthorized(message)
                return
            recent = self.db.get_recent_log_lines(limit=20)
            if not recent:
                await message.answer("No audit logs recorded yet.")
                return

            lines = []
            for r in recent:
                ts = r.get("timestamp", "").split("T")[-1][:8]
                typ = r.get("type", "")
                cmd = r.get("command") or ""
                dec = r.get("decision") or ""
                line = f"[{ts}] {typ}: {cmd} -> {dec}".strip()
                lines.append(sanitize_secrets(line))

            content = "\n".join(lines)
            await message.answer(f"📜 *Last 20 Audit Log Entries:*\n```text\n{content}\n```", parse_mode="Markdown")

        @self._dp.message(F.text == "/summary")
        async def handle_summary(message: Message) -> None:
            if not self.db.is_chat_allowed(message.chat.id):
                self._check_unauthorized(message)
                return
            if not self.advisory_engine:
                await message.answer("Advisory engine is not configured.")
                return

            await message.answer("Analyzing recent activity with advisory model...")
            summary_text = await self.advisory_engine.get_summary(max_lines=50)
            await message.answer(sanitize_secrets(summary_text), parse_mode="Markdown")

        @self._dp.message(F.text == "/help")
        async def handle_help(message: Message) -> None:
            if not self.db.is_chat_allowed(message.chat.id):
                self._check_unauthorized(message)
                return
            help_text = (
                "🛡️ *SŪTRA Telegram Commands:*\n\n"
                "• `/status` - Agent status & active task\n"
                "• `/pause` - Pause agent execution\n"
                "• `/resume` - Resume agent execution\n"
                "• `/stop` - Stop agent execution permanently\n"
                "• `/steer <text>` - Provide mid-flight guidance\n"
                "• `/log` - View last 20 sanitized audit log entries\n"
                "• `/summary` - Advisory summary (Gemma/heuristic)\n"
                "• `/unpair` - Revoke remote supervision access\n"
                "• `/help` - Show this command list"
            )
            await message.answer(help_text, parse_mode="Markdown")

        # Catch-all for unknown messages from non-paired chats
        @self._dp.message()
        async def handle_any(message: Message) -> None:
            if not self.db.is_chat_allowed(message.chat.id):
                self._check_unauthorized(message)

        # --------------------------------------------------------------------
        # INLINE BUTTON CALLBACK HANDLER
        # --------------------------------------------------------------------
        @self._dp.callback_query()
        async def handle_callback(query: CallbackQuery) -> None:
            if not query.message or not query.data:
                return

            if not self.db.is_chat_allowed(query.message.chat.id):
                await query.answer("Unauthorized.", show_alert=True)
                return

            # Callback data format: action:approval_id
            try:
                action, approval_id = query.data.split(":", 1)
            except ValueError:
                await query.answer("Malformed callback data.", show_alert=True)
                return

            decision_map = {
                "once": DecisionType.ALLOW_ONCE.value,
                "session": DecisionType.ALLOW_SESSION.value,
                "deny": DecisionType.DENY.value,
            }
            decision = decision_map.get(action)
            if not decision:
                await query.answer("Invalid decision option.", show_alert=True)
                return

            actor = f"telegram:@{query.from_user.username or query.from_user.id}"

            # Server-side callback: will fail if stale, duplicate, or expired
            if self._decision_callback:
                try:
                    await self._decision_callback(approval_id, decision, actor)
                except Exception as exc:
                    await query.answer(f"Failed to submit decision: {exc}", show_alert=True)
                    return

            # Edit the original message to reflect the result and remove buttons
            result_icon = "✅" if "ALLOW" in decision else "❌"
            username = query.from_user.username or str(query.from_user.id)
            original_text = query.message.text or ""

            updated_text = (
                f"{original_text}\n\n"
                f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                f"{result_icon} *Decision:* `{decision}`\n"
                f"👤 *Decided by:* `@{username}`"
            )
            sanitized_update = sanitize_secrets(updated_text)

            try:
                await query.message.edit_text(
                    text=sanitized_update,
                    parse_mode="Markdown",
                    reply_markup=None,  # Remove inline buttons
                )
                await query.answer(f"Registered decision: {decision}")
            except Exception as exc:
                print(f"[TELEGRAM] Failed to update message post-decision: {exc}")

        # Start long-polling in background task
        self._polling_task = asyncio.create_task(
            self._dp.start_polling(self._bot, handle_signals=False)
        )
        print("[SŪTRA] Telegram long polling started (outbound-only, no webhooks).")

    def _check_unauthorized(self, message: Any) -> None:
        """Log unknown chat on first message to console only. Never reply."""
        chat_id = message.chat.id
        if chat_id not in self._seen_unknown_chats:
            self._seen_unknown_chats.add(chat_id)
            print(f"[SECURITY] Unauthorized Telegram chat attempt logged: chat_id={chat_id}")

    async def stop(self) -> None:
        """Stop polling and close bot session."""
        if self._dp:
            await self._dp.stop_polling()
        if self._polling_task and not self._polling_task.done():
            self._polling_task.cancel()
        if self._bot:
            await self._bot.session.close()
        print("[SŪTRA] TelegramChannel stopped.")

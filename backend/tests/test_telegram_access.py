"""Tests for Telegram access control, message sanitization, and security rules."""

from pathlib import Path
from unittest.mock import AsyncMock, MagicMock
import pytest

from sutra.approval import ApprovalRequest
from sutra.channels import TelegramChannel
from sutra.db import Database
from sutra.policy import RiskLevel, sanitize_secrets


@pytest.fixture
def telegram_env(tmp_path: Path):
    db = Database(tmp_path / "tg_test.db")
    channel = TelegramChannel(bot_token="123456:FAKE_TOKEN", db=db)
    return channel, db


def test_telegram_unauthorized_chat_silence(telegram_env, capsys):
    """Unknown chat first message logs to console only and never responds."""
    channel, db = telegram_env

    mock_msg = MagicMock()
    mock_msg.chat.id = 987654321
    mock_msg.text = "Hello there"

    # Simulate unknown chat message
    channel._check_unauthorized(mock_msg)
    captured = capsys.readouterr()

    # Logged to console
    assert "987654321" in captured.out
    assert "Unauthorized Telegram chat" in captured.out

    # Second message from same unknown chat does not re-log
    channel._check_unauthorized(mock_msg)
    captured2 = capsys.readouterr()
    assert captured2.out == ""


def test_telegram_secret_sanitization():
    """Text sent to Telegram is rigorously sanitized."""
    raw = (
        "Super secret token: sk-abcdef1234567890abcdef1234567890\n"
        "DATABASE_URL=postgres://user:pass@127.0.0.1:5432/db"
    )
    clean = sanitize_secrets(raw)
    assert "sk-abcdef" not in clean
    assert "postgres://user:pass" not in clean
    assert "DATABASE_URL=[REDACTED]" in clean


@pytest.mark.asyncio
async def test_telegram_high_risk_hides_allow_session(telegram_env):
    """HIGH risk approval messages hide the 'Allow session' inline button."""
    channel, db = telegram_env

    # Pair a chat
    code = db.create_pairing_code()
    db.verify_and_pair(code, chat_id=12345)

    # Mock aiogram bot
    mock_bot = MagicMock()
    mock_bot.send_message = AsyncMock(return_value=MagicMock(message_id=999))
    channel._bot = mock_bot

    high_req = ApprovalRequest(
        command="git push origin main",
        risk=RiskLevel.HIGH.value,
        reason="Pushing code to remote",
    )

    await channel.send_approval_request(high_req)
    assert mock_bot.send_message.called
    kwargs = mock_bot.send_message.call_args.kwargs
    keyboard = kwargs["reply_markup"]

    # Extract button callback data
    callback_datas = [
        btn.callback_data
        for row in keyboard.inline_keyboard
        for btn in row
    ]

    assert f"once:{high_req.id}" in callback_datas
    assert f"deny:{high_req.id}" in callback_datas
    # Must NOT have session allow button
    assert f"session:{high_req.id}" not in callback_datas

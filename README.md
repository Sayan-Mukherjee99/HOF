# SŪTRA (सूत्र)

> **Local-First, Outbound-Only Remote Supervision Prototype for Autonomous Coding Agents.**

SŪTRA allows a developer or team lead to remotely monitor and supervise an autonomous local coding agent from their phone via Telegram (or directly from the terminal via ConsoleChannel) — without exposing any public inbound ports, webhooks, or compromising sensitive secrets.

---

## 🏛️ Architecture & Principles

1. **Local-First & Outbound-Only**:
   - The supervision server binds strictly to `127.0.0.1` locally.
   - Remote communication uses **Telegram Long-Polling** (`getUpdates`). No reverse proxies, ngrok tunnels, or inbound public ports are opened.
2. **Deterministic Policy Engine**:
   - Classifies commands into `LOW`, `MEDIUM`, `HIGH`, or `BLOCKED`.
   - Hard blocks path traversal (`..`), symlink escapes (`realpath`), superuser escalation (`sudo`), recursive force deletion (`rm -rf`), piped shells (`curl|sh`), and credentials (`.env`, `*.pem`, `*.key`, `id_rsa`).
   - Unknown commands strictly default to `HIGH`, never `LOW`.
3. **Secret Redaction**:
   - All tokens (`sk-...`, `ghp_...`, `xoxb-...`, `AKIA...`, JWTs), private keys, `.env` pairs, and `KEY=value` patterns are sanitized before entering logs, events, database, or Telegram messages.
4. **Append-Only SQLite Audit Log**:
   - High concurrency SQLite operating in **WAL mode** (`PRAGMA journal_mode=WAL;`).
   - No `UPDATE` or `DELETE` SQL queries exist for the audit table in the codebase.
5. **Single-Supervisor Pairing**:
   - Ephemeral one-time pairing codes (5-minute TTL, single-use).
   - Only the paired chat ID receives updates and can execute commands. Unknown chats receive complete silence.

---

## 🚀 Quickstart & Setup

### 1. Requirements
- Python 3.11+
- Make (optional, for shortcuts)

### 2. Installation
```bash
# Clone and enter directory
cd /path/to/sutra

# Create virtualenv and install dependencies
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
pip install -e backend
```

### 3. Configuration
Copy the template configuration:
```bash
cp .env.example .env
```
Key variables in `.env`:
| Variable | Description | Default |
| :--- | :--- | :--- |
| `HOST` | Dashboard backend bind address | `127.0.0.1` |
| `PORT` | Dashboard backend port | `8000` |
| `WORKSPACE_ROOT` | Target codebase folder | `.` |
| `DATABASE_PATH` | SQLite WAL audit log database | `sutra_audit.db` |
| `CORS_ORIGIN` | Allowed dashboard Vite frontend origin | `http://localhost:5173` |
| `BOT_TOKEN` | Telegram Bot token (optional; if missing, runs ConsoleChannel) | `""` |
| `OLLAMA_URL` | Local Ollama instance URL | `http://localhost:11434` |
| `OLLAMA_MODEL` | Advisory model name | `gemma3:4b` |

---

## 🤖 Telegram Bot Setup (BotFather)

If you wish to supervise the agent from your mobile phone:

1. **Create the Bot**:
   - Open Telegram and message [@BotFather](https://t.me/BotFather).
   - Send `/newbot`.
   - Choose a display name (e.g., `Sutra Agent Supervisor`) and a unique username ending in `bot` (e.g., `my_sutra_supervisor_bot`).
   - BotFather will provide an HTTP API token (format: `123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ`).
2. **Add Token to `.env`**:
   ```bash
   BOT_TOKEN=123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ
   ```
3. **Revoking the Token Afterward**:
   - Whenever you are finished with testing, message [@BotFather](https://t.me/BotFather).
   - Send `/revoke`, select your bot, and BotFather will instantly invalidate the token.

> 💡 **Note**: If `BOT_TOKEN` is unset or omitted in `.env`, SŪTRA automatically starts with `ConsoleChannel` in your terminal without any extra setup.

---

## 📲 Pairing a Remote Supervisor

SŪTRA strictly enforces single-supervisor isolation:

1. On the host machine running SŪTRA, generate a fresh pairing code:
   ```bash
   python -m sutra pair
   ```
   *Output:*
   ```text
   ======================================================
   🔑 SŪTRA ONE-TIME PAIRING CODE: 8F2A1C
   • Validity: 5 minutes (single use)
   • In Telegram, send to your bot: /pair 8F2A1C
   ======================================================
   ```
2. Open Telegram on your phone, find your bot, and send:
   ```text
   /pair 8F2A1C
   ```
3. The bot responds: `✅ Successfully paired with SŪTRA!`
4. **Security Isolation**:
   - If any other user or unknown chat messages the bot, their `chat_id` is logged to the local console once for security review, and the bot remains completely silent.
5. To revoke access:
   - Send `/unpair` in Telegram.

---

## ⏱️ 2-Minute Demo Script

Run the automated demo task using `python -m sutra.seed`:

```bash
# Run demo
python -m sutra.seed
```

### Flow of the Demo:
1. **LOW Risk Command (`ls`)**:
   - Agent indexes repository.
   - Policy Engine classifies as `LOW`.
   - **Auto-approved** instantly, logged in audit table.
2. **MEDIUM Risk Command (`git add backend/parser.py`)**:
   - Agent attempts file staging.
   - Classification: `MEDIUM`.
   - Telegram sends an interactive approval card with inline buttons:
     `[ Allow once ]` `[ Allow session ]` `[ Deny ]`
   - Tap **Allow once** (or enter `y` in Console).
   - Agent proceeds and marks stage complete.
3. **BLOCKED Risk Command (`cat ../../.env`)**:
   - Agent attempts credential and directory traversal inspection.
   - Classification: `BLOCKED` (path traversal + sensitive `.env`).
   - **Auto-denied** immediately. Never sent to Telegram or user; logged in SQLite audit table.
4. **HIGH Risk Command (`git push origin main`)**:
   - Agent attempts remote git push.
   - Classification: `HIGH`.
   - Telegram sends approval card: `[ Allow once ]` `[ Deny ]` (*"Allow session" is automatically hidden for HIGH risk*).
   - Tap **Allow once** (or `n` to test rejection).
   - Agent finishes task.
5. Terminal prints the audit table summary with all timestamps, actors, decisions, and commands.

---

## 💬 Telegram Commands (Paired Chat Only)

| Command | Action |
| :--- | :--- |
| `/status` | View agent status, active task, and pairing information |
| `/pause` | Temporarily pause agent execution |
| `/resume` | Resume paused execution |
| `/stop` | Permanently stop current agent task |
| `/steer <text>` | Provide mid-flight guidance and instructions |
| `/log` | Fetch last 20 sanitized audit log entries |
| `/summary` | Advisory summary of agent progress (Gemma via Ollama or rule-based fallback) |
| `/unpair` | Revoke remote supervision permissions |
| `/help` | List available commands |

---

## 🧠 Advisory Engine (Gemma via Ollama)

- Advisory summaries never execute, approve, or deny commands.
- If Ollama is running (`ollama run gemma3:4b`), `/summary` sends the last 50 sanitized log entries to generate a 3-line status overview and detect looping or stuck states.
- If Ollama is not installed or unreachable, SŪTRA automatically falls back to an internal rule-based heuristic checking consecutive command loops and idle timeouts, explicitly noting the fallback in the reply.

---

## 📊 Built vs. Planned

| Component | Status | Details |
| :--- | :---: | :--- |
| **Deterministic Policy Engine** | ✅ Built | Pure functions: `LOW`, `MEDIUM`, `HIGH`, `BLOCKED`. Traversals, symlink realpath escapes, credential files, `rm -rf`, `sudo`, `curl\|sh`. |
| **Secret Sanitizer** | ✅ Built | Redacts API tokens, private keys, `.env` assignments, and `KEY=value` patterns. |
| **Event Bus** | ✅ Built | In-process async pub/sub with sanitized event broadcasting. |
| **SQLite WAL Audit Table** | ✅ Built | Append-only audit table with cursor pagination. Zero `UPDATE`/`DELETE` paths. |
| **Approval Manager** | ✅ Built | 120s timeouts, auto-deny, duplicate rejection, session allow rules (banned for HIGH). |
| **ConsoleChannel** | ✅ Built | Terminal interactive supervision fallback. |
| **TelegramChannel (aiogram 3)** | ✅ Built | Long-polling only (no webhooks), single-chat access isolation, inline decision buttons. |
| **One-Time Pairing CLI** | ✅ Built | `python -m sutra pair` generates 5-minute single-use pairing codes. |
| **Local Dashboard API (FastAPI)** | ✅ Built | Bound to `127.0.0.1` with CORS restricted to Vite origin; WebSocket `/ws/events`. |
| **Advisory Engine** | ✅ Built | Gemma 3 via Ollama with automatic rule-based fallback for looping/stuck detection. |
| **ClaudeCode / Cursor Adapters** | 📝 Planned | Stubs prepared in `sutra.agent` (`ClaudeCodeAdapter`, `CursorAdapter`, `GenericCLIAdapter`). |
| **Web Dashboard UI (Frontend)** | 📝 Planned | Folder `/frontend` ready for Vite/React implementation. |

---

## 🧪 Testing

Run the full pytest suite:
```bash
make test
```
Or directly:
```bash
.venv/bin/pytest backend/tests -v
```
All 28 unit and integration tests verify:
- Policy risk classifications and strict unknown-command escalation
- Path traversal and symlink escape blocks
- Secret sanitization across logs, events, and Telegram
- SQLite WAL mode and append-only guarantees
- Pairing lifecycle and unauthorized chat silence
- Approval expiration and duplicate submission rejection
- FastAPI endpoints and agent controls

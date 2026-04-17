# Agent Desktop App: Project Plan

Personal project to build an interactive, multi-agent desktop app using the Claude Agent SDK. This file is the source of truth for architecture decisions and the build roadmap. Keep it in the repo root.

## What I'm Building

A desktop chat app where I can talk to one or more Claude agents. Multiple agents run as independent Python processes and are orchestrated by a local backend. The frontend is an Electron window running a React chat UI that streams agent output live over WebSockets.

Use case examples (long-term):
- Research assistant that fans out to specialist subagents
- Personal project manager that checks in on my assignments and repos
- Workflow agent that ties into my existing n8n stack

## Architecture

```
+---------------------------+       +----------------------------+
|   Electron window         |       |   FastAPI server           |
|   (React + Vite)          | <---> |   (runs on localhost:8000) |
|                           |  WS   |                            |
+---------------------------+       |   - WebSocket endpoint     |
                                    |   - Spawns/manages SDK     |
                                    |     processes              |
                                    |   - Holds session state    |
                                    +-------------+--------------+
                                                  |
                                                  | spawns
                                                  v
                                    +----------------------------+
                                    |   Claude Agent SDK         |
                                    |   processes (1 or more)    |
                                    |                            |
                                    |   Each has:                |
                                    |   - Role/system prompt     |
                                    |   - Tool allowlist         |
                                    |   - Own context window     |
                                    +----------------------------+
```

Inter-agent coordination: asyncio queues to start. Redis pub/sub if/when I split into fully separate processes or migrate to OCI.

## Tech Stack

| Layer              | Choice                          | Why                                    |
|--------------------|---------------------------------|----------------------------------------|
| Agent runtime      | Claude Agent SDK (Python)       | Official, async, feature-complete      |
| Backend framework  | FastAPI                         | Modern, async, built-in WebSocket      |
| ASGI server        | uvicorn[standard]               | Standard pairing with FastAPI          |
| Desktop shell      | Electron                        | Reuses React skills, biggest ecosystem |
| Frontend           | React + TypeScript + Vite       | Via electron-vite scaffold             |
| Styling            | Tailwind v4                     | Fast, no PostCSS config needed         |
| State (frontend)   | Zustand                         | Lightweight, less boilerplate than Redux |
| Transport          | WebSockets (browser native)     | Bidirectional, built in                |
| Storage (local)    | SQLite                          | Zero setup, ships with Python          |
| Storage (later)    | Postgres on OCI n8nServer       | Same box already runs Postgres         |
| Coordination       | asyncio queues -> Redis later   | Simple first, scale when needed        |

## Folder Structure

```
C:\Users\JENNY\Documents\
├── AgentUI\                    # Electron frontend
│   ├── src\
│   │   ├── main\               # Electron main process
│   │   ├── preload\            # Preload scripts
│   │   └── renderer\           # React app
│   ├── package.json
│   └── electron.vite.config.ts
│
└── agent-backend\              # Python backend
    ├── .venv\                  # Virtual environment
    ├── .env                    # (not committed) Anthropic auth config
    ├── main.py                 # Dev entry point
    ├── server.py               # FastAPI app
    ├── agents\                 # Agent role definitions
    └── requirements.txt
```

Two sibling folders, not one monorepo. Keeps Electron and Python tooling from fighting each other.

## Roadmap

### Phase 0: Prereqs
- [ ] Python 3.11+ installed from python.org (not Microsoft Store)
- [ ] Node.js 20+ installed
- [ ] `where python` returns a real path, not WindowsApps
- [ ] Git repo initialized
- [ ] `.gitignore` covers `.venv/`, `.env`, `node_modules/`, `dist/`, `out/`

### Phase 1: SDK hello world in Python
- [ ] `agent-backend/` folder created
- [ ] venv created and activated
- [ ] `pip install fastapi uvicorn[standard] claude-agent-sdk python-dotenv`
- [ ] `main.py` runs and streams output from a one-shot query
- [ ] Understand the message block types (AssistantMessage, ToolUseBlock, ToolResultBlock, ResultMessage)

### Phase 2: FastAPI wrapper with WebSocket streaming
- [ ] `server.py` with a WebSocket endpoint at `/chat`
- [ ] On incoming message, call `query()` and stream blocks back to the socket
- [ ] Test with a throwaway HTML page that opens a WS and displays messages

### Phase 3: Electron + React shell
- [ ] Scaffold done with `npm create @quick-start/electron@latest`
- [ ] Chat UI in React (input, message list, WS hook)
- [ ] Connects to `ws://localhost:8000/chat`
- [ ] Messages stream in live

### Phase 4: Multi-agent orchestration
- [ ] Define agent roles with `AgentDefinition`
- [ ] Spawn multiple `ClaudeSDKClient` instances from the orchestrator
- [ ] Route output from each back to the UI with an agent_id tag
- [ ] UI shows which agent said what

### Phase 5: Storage
- [ ] SQLAlchemy models for sessions and messages
- [ ] SQLite connection in dev
- [ ] Persist conversation history
- [ ] Load previous sessions on app open

### Phase 6: Polish and OCI migration (optional)
- [ ] PyInstaller packaging of Python backend
- [ ] Bundle Python binary into Electron via electron-builder
- [ ] Or: move backend to OCI n8nServer in Docker and point Electron at `wss://remyn8n.duckdns.org`
- [ ] Swap SQLite for Postgres (connection string change only)

## Auth Strategy

Using Claude subscription auth during development (not API key). The SDK spawns Claude Code CLI underneath, which supports subscription login.

Setup:
1. `npm install -g @anthropic-ai/claude-code`
2. `claude login` and pick "Claude account with subscription"
3. Make absolutely sure `ANTHROPIC_API_KEY` is NOT set in any env var. If it exists, the SDK bills the API instead of the subscription.
4. Don't load dotenv or pass an API key in the Python code.

Verify it's unset:
```powershell
echo $env:ANTHROPIC_API_KEY
```

Caveats:
- Not officially supported by Anthropic. Could break on any SDK update.
- Subscription rate limits reset every 5 hours and are shared with claude.ai web chat. Multi-agent loops burn these fast.
- For anything deployed or shared with others, switch to an API key. Python code doesn't change, only the env.

## Dependencies

### Python (agent-backend)
```bash
pip install fastapi uvicorn[standard] claude-agent-sdk python-dotenv
```

Later phases:
```bash
pip install sqlalchemy aiosqlite       # Phase 5
pip install redis[hiredis]             # Phase 4 if going multi-process
pip install pyinstaller                # Phase 6
```

### Node (AgentUI)
Base (done by scaffold):
- electron, react, react-dom, typescript, vite, electron-vite, electron-builder

Added by me:
```bash
npm i tailwindcss @tailwindcss/vite lucide-react react-markdown remark-gfm zustand
```

Dev helpers (later):
```bash
npm i -D concurrently wait-on cross-env
```

## Known Gotchas

- **Microsoft Store Python is broken for this use case.** Always use python.org installer. `where python` should never show `WindowsApps`.
- **PyInstaller + Agent SDK is hard** because the SDK spawns the Claude Code CLI (Node.js) as a subprocess. Bundling a Python binary that shells out to Node is a Phase 6 battle, not a Phase 1 concern.
- **Don't try to fuse Next.js with Electron.** Use plain React via electron-vite. The Next.js server model doesn't fit desktop apps.
- **Do not set ANTHROPIC_API_KEY** while developing on subscription auth. It silently takes precedence and bills the API.
- **WebSockets need keepalive.** If a connection idles during a long agent task, proxies (later on OCI) may drop it. Send periodic pings.

## Style Preferences (for any AI assistant reading this)

- No em dashes in drafted text
- Plain human-sounding prose, not formal or polished
- Concise over verbose

## Resources

### Official
- Agent SDK overview: https://platform.claude.com/docs/en/agent-sdk/overview
- Python quickstart: https://platform.claude.com/docs/en/agent-sdk/quickstart
- Python SDK reference: https://platform.claude.com/docs/en/agent-sdk/python
- Subagents: https://platform.claude.com/docs/en/agent-sdk/subagents
- Hosting: https://platform.claude.com/docs/en/agent-sdk/hosting

### Demos
- https://github.com/anthropics/claude-agent-sdk-demos (multi-agent research system is directly relevant)

### Supporting docs
- FastAPI WebSockets: https://fastapi.tiangolo.com/advanced/websockets/
- electron-vite: https://electron-vite.org
- Redis async Python: https://redis.readthedocs.io/en/stable/examples/asyncio_examples.html

### For later
- MCP spec (when adding external tools): https://modelcontextprotocol.io

## Current Status

Replace this section as you go. Right now:

**Phase:** 1 (SDK hello world)
**Blocker:** Need to run `main.py` successfully
**Next action:** Confirm Python install is from python.org, create agent-backend folder, install deps, run main.py

---

*Last updated: April 2026*

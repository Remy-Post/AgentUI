# AgentUI

AgentUI is a local Claude Agent SDK interface with two front ends:

- `agent-client`: Electron desktop app with a React renderer.
- `agent-web`: browser-based React app for the same local server.

Both clients talk to `agent-server`, an Express + Mongoose service that stores local state in MongoDB and streams agent turns with Server-Sent Events.

## Stack

- Node 20.18+ and npm workspaces.
- TypeScript ESM across all workspaces.
- Electron 39, electron-vite, and electron-builder for the desktop app.
- React 19, Vite 7, Tailwind v4, TanStack Query, Zustand, `react-markdown`, `remark-gfm`, and `lucide-react` for the UI.
- Express 5, Mongoose 8, and `@anthropic-ai/claude-agent-sdk` on the server.
- Local MongoDB at `mongodb://127.0.0.1:27017/agent-desk` by default.

## Requirements

- Node.js 20.18 or newer.
- npm 10 or newer.
- MongoDB running locally, unless `MONGODB_URI` points elsewhere.
- An Anthropic API key for agent runs.
- Optional `GITHUB_TOKEN` for private GitHub repository access.

## Setup

Install dependencies from the repository root:

```bash
npm install
```

Start MongoDB locally, then run the app in development:

```bash
npm run dev
```

`npm run dev` starts the server, Electron app, and web app together. The default development endpoints are:

- Server: `http://127.0.0.1:3001`
- Web app: `http://127.0.0.1:5174`
- Electron renderer: launched by electron-vite

### Secrets

The desktop app stores secrets through Electron `safeStorage`. Add the Claude API key in Settings -> Keys, then restart the app so the server process receives it as `ANTHROPIC_API_KEY`.

The browser app cannot use Electron secure storage. For browser development, set secrets in the server environment instead:

```bash
ANTHROPIC_API_KEY=sk-ant-...
GITHUB_TOKEN=github_pat_...
```

On Windows PowerShell:

```powershell
$env:ANTHROPIC_API_KEY = "sk-ant-..."
$env:GITHUB_TOKEN = "github_pat_..."
```

The server also reads `.env` through `dotenv`.

## Commands

Run these from the repository root.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start server, Electron app, and web app |
| `npm run dev:app` | Start server and Electron app only |
| `npm run dev:web` | Start server and web app only |
| `npm run dev:server` | Start only `agent-server` on the dev port |
| `npm run cli` | Run the server-side CLI conversation fallback |
| `npm run typecheck` | Typecheck server, Electron app, and web app |
| `npm run test` | Run server tests |
| `npm run build` | Build server and Electron app |
| `npm run build:web` | Build the browser app |
| `npm run build:unpack` | Build unpacked Electron output for inspection |
| `npm run build:win` | Build a Windows package |
| `npm run build:mac` | Build a macOS package |
| `npm run build:linux` | Build a Linux package |

## Architecture

`agent-server` owns Claude Agent SDK orchestration, MongoDB persistence, REST APIs, and POST-based SSE streams. In development it listens on `127.0.0.1:3001` unless `AGENT_SERVER_PORT` is set. In packaged Electron builds, the main process forks the compiled server as a `utilityProcess` and receives the selected port over `process.parentPort`.

`agent-client` contains the Electron main process, preload API, and React renderer. It retrieves the local server port through IPC and talks to the server with `fetch`.

`agent-web` is a Vite app that talks directly to the local server. It uses `VITE_AGENT_SERVER_URL` when set, otherwise `http://127.0.0.1:3001`.

Conversations, messages, settings, skills, subagents, memories, usage, and related local data are persisted in MongoDB. The server materializes enabled skills and subagents from MongoDB into `agent-server/.claude/...` for the SDK; those generated files should not be edited by hand.

## Project Layout

```text
AgentUI/
├── agent-client/          # Electron main/preload plus React renderer
├── agent-server/          # Express API, Claude SDK orchestration, MongoDB models
├── agent-web/             # Browser React app backed by agent-server
├── docs/                  # Project notes and investigations
├── storage/               # Local runtime data, ignored by git
├── AgentUI Preview.html   # Standalone wireframe reference
├── wireframe_v1.fig       # Source design artifact
├── CLAUDE.md              # Detailed engineering notes
├── AGENTS.md              # Agent instructions for this repo
└── package.json           # Root workspace scripts
```

## Development Notes

- Server-side relative imports inside `agent-server/` must include `.ts` extensions.
- Renderer imports from `@shared/*` are type-only and map to `agent-server/src/shared/*`.
- POST SSE is consumed with `fetch` and `ReadableStream`, not `EventSource`.
- Do not hand-edit generated `agent-server/.claude/agents` or `agent-server/.claude/skills` files.
- Run `npm run typecheck` after code changes.

## Testing

```bash
npm run typecheck
npm run test
```

`npm run typecheck` covers all three workspaces. `npm run test` currently runs the server test suite.

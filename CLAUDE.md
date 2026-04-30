# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. **Read the Stack and Project fundamentals sections below at the start of every conversation before doing other exploration.**

## Stack

- **Runtime**: Node 20.18+ (Electron 39 ships Node 22). `"type": "module"` in both workspaces.
- **Language**: TypeScript ~5.9.3 across both workspaces (pinned). `module: NodeNext` in `agent-server/`. `agent-client/` uses electron-toolkit's split tsconfigs (`tsconfig.node.json` for main + preload, `tsconfig.web.json` for renderer with bundler resolution).
- **Server**: Express 5 + Mongoose 8. Default-import `mongoose` (named imports break under ESM). `@anthropic-ai/claude-agent-sdk ^0.2.114` drives chat turns via `query`; SDK session ids persist on conversations and resume through query options.
- **Database**: MongoDB local at `mongodb://127.0.0.1:27017/agent-desk`. Assume `mongod` is running. Not bundled.
- **Desktop shell**: Electron 39 + electron-vite 5 + electron-builder 26.
- **Renderer**: React 19 + Vite 7 + Tailwind v4 (via `@tailwindcss/vite` plugin and `@import "tailwindcss"`). State: TanStack Query for server data, Zustand for UI/streaming state. Markdown via `react-markdown` + `remark-gfm`. Icons from `lucide-react`.
- **Streaming**: Server-Sent Events. `POST /api/sessions/:id/messages` returns `text/event-stream` directly; renderer parses via `fetch` + `ReadableStream` because `EventSource` is GET-only.
- **Secrets**: Electron `safeStorage` (Keychain / DPAPI / libsecret) for `ANTHROPIC_API_KEY`. Never persisted to Mongo.
- **Packaging**: Server ships via electron-builder `extraResources`, not asar (utilityProcess.fork + native deps don't mix well with asar).

## Project fundamentals

- **Internal imports in `agent-server/` MUST end in `.ts`** (because of `allowImportingTsExtensions` + `rewriteRelativeImportExtensions`). Example: `import { TOOLS } from '../util/vars.ts'`. The compiler rewrites the extension to `.js` at emit time. This does not apply to `agent-client/` (bundler resolution).
- **Two server entrypoints**: `agent-server/src/server.ts` (Express, used by the desktop app) and `agent-server/src/main.ts` (CLI, available as `npm run cli`). The CLI runs the same orchestration code path as the server (`runConversationTurn`, Mongo persistence, Tool/Skill/Subagent registry, toolPolicy) but emits events to stdout instead of SSE. Use it to exercise backend changes — including from another AI agent (Codex / Claude Code / Gemini) — without launching Electron.
- **Process model in production**: Electron main forks Express as a `utilityProcess` child, port handoff via `process.parentPort.postMessage({type:'ready', port})`. In dev, Express runs separately via `tsx watch`; main reads `AGENT_SERVER_PORT` (default 3001) from env.
- **CSP**: applied at runtime via `session.defaultSession.webRequest.onHeadersReceived` because the chosen port is dynamic. The static `<meta>` CSP in `index.html` is omitted.
- **Skills/Subagents/Tools source of truth**: MongoDB. The SDK does not accept in-memory `agents`/`skills` config, so the server materializes Mongo records to `agent-server/.claude/agents/<name>.md` and `.claude/skills/<name>/SKILL.md` via `src/agent/scaffold.ts`, and uses `settingSources: ['project']`. CRUD endpoints regenerate the affected files. The CLI uses the same Mongo registry — there is no separate seed file.
- **Streaming concurrency**: one active stream per `conversationId`. Concurrent stream requests on the same conversation return 409. See `src/agent/session.ts`.
- **`process.parentPort` is undefined when not launched by `utilityProcess.fork`**. Always guard with `?.`. The local type augmentation lives at `agent-server/src/types/globals.d.ts`.
- **`@shared/*` alias** (in renderer only) maps to `agent-server/src/shared/types.ts`. Type-only imports. Never import runtime values from agent-server into the renderer.
- **No tests, no linter wired in `agent-server/`**. `agent-client/` has eslint + prettier but they're not on a mandatory hook.

## Mandatory check

Run `npm run typecheck` from the repo root after every modification. It runs both workspace typechecks. Do not consider a change complete until both pass.

## Repository layout

Single-user Electron desktop app structured as MERN: Mongoose + Express child process + React renderer + Node (Electron main + Express). npm workspaces at the root.

- `agent-server/` — Node ESM. Hosts the Claude Agent SDK, Express HTTP API, and Mongoose models. Has two entrypoints: `src/server.ts` (Express, used by the desktop app) and `src/main.ts` (CLI, available as `npm run cli`, same code path as the server).
- `agent-client/` — Electron 39 + React 19 + Tailwind v4 + electron-vite. Forks the compiled server as a `utilityProcess` child in production; in dev the server runs separately via `tsx watch`.
- `storage/`, `.env`, `agent-client/{out,dist,node_modules}`, and runtime-scaffolded `agent-server/.claude/agents/` + `.claude/skills/` are gitignored.

## Commands (run from repo root)

| Command | Purpose |
|---|---|
| `npm run dev` | `concurrently` runs `tsx watch agent-server/src/server.ts` and `electron-vite dev` |
| `npm run cli` | Server-equivalent CLI via `tsx agent-server/src/main.ts` (see "CLI" section below) |
| `npm run typecheck` | Runs `tsc --noEmit` in both workspaces |
| `npm run build` | `tsc -p agent-server/tsconfig.server.json` then `electron-vite build` |
| `npm run build:win` / `:mac` / `:linux` | Builds + electron-builder for the platform |
| `npm run build:unpack` | Builds + `electron-builder --dir` for inspection without code signing |

`agent-server/` TS config: `module: NodeNext`, `allowImportingTsExtensions`, `rewriteRelativeImportExtensions`. **Internal imports must end in `.ts`** (e.g. `import { TOOLS } from '../util/vars.ts'`). `package.json` is `"type": "module"`. Server build uses `tsconfig.server.json`; the wider `tsconfig.json` covers typecheck.

`agent-client/` uses `tsconfig.web.json` (renderer) and `tsconfig.node.json` (main + preload). Renderer has bundler resolution and a `@shared/*` path alias to `../agent-server/src/shared/*` for type-only DTO imports.

## Architecture

### Process model

Three runtime processes in production:

1. **Electron main** (`agent-client/src/main/`). Decrypts the API key from `safeStorage`, forks the Express server via `utilityProcess.fork`, waits for `{type: 'ready', port}` on `parentPort`, applies a runtime CSP via `webRequest.onHeadersReceived` (because the chosen port is dynamic), and opens the BrowserWindow.
2. **Express child** (`agent-server/src/server.ts`). Binds `127.0.0.1:0` so the OS picks a port, posts it back via `process.parentPort.postMessage`, hosts CRUD + SSE endpoints, owns Agent SDK orchestration/runtime policy and the Mongoose connection.
3. **Renderer**. React + TanStack Query for server state, Zustand for transient UI state. Calls Express via `fetch`. Streams turn events via fetch + manual SSE parsing (POST endpoint precludes `EventSource`).

In dev, electron-vite runs the renderer + main; `tsx watch` runs the server separately. The main process skips the fork and reads `AGENT_SERVER_PORT` (default `3001`) from the env.

### MongoDB

Local at `mongodb://127.0.0.1:27017/agent-desk` via Mongoose. Models in `agent-server/src/db/models/`:

- `Conversation` — `{ title, model, timestamps }`
- `Message` — `{ conversationId, role: 'user'|'assistant'|'tool'|'system', content (Mixed), createdAt, costUsd? }`
- `Skill` — `{ name unique, description, body, parameters (Mixed), allowedTools, enabled }`
- `Subagent` — `{ name unique, description, prompt, model, effort, permissionMode, tools, enabled }`

Assume `mongod` is running locally. Server fails gracefully on startup if the DB is unreachable; `/health` reports `{ db: 'down' }`.

### Subagents and skills source of truth

The SDK's `unstable_v2_createSession` does not accept in-memory `agents` or `skills` config maps; it reads from disk via `settingSources`. The server keeps Mongo as the source of truth and materializes enabled records to `agent-server/.claude/agents/<name>.md` and `agent-server/.claude/skills/<name>/SKILL.md` via `src/agent/scaffold.ts`. Sync runs on startup and on every Skill/Subagent CRUD endpoint. The CLI (`src/main.ts`) shares the same Mongo registry, so toggling tools/skills/subagents in the desktop UI takes effect for the next CLI run.

### CLI

`agent-server/src/main.ts` runs the server's orchestration code path (`runConversationTurn`, `loadRuntimeConfig`, the Tool/Skill/Subagent/Settings registry from Mongo) and emits events to stdout instead of an SSE response. Use it to drive backend changes from a terminal — including from another AI agent debugging a backend issue.

```bash
npm run cli                                          # interactive REPL, new conversation
npm run cli -- --prompt "your message"               # single-shot, new conversation
npm run cli -- --conversation <id>                   # resume existing conversation (REPL)
npm run cli -- --conversation <id> --prompt "..."    # single-shot against existing conversation
npm run cli -- --model opus                          # override model on a new conversation
```

Output is bracketed lines on stdout, parseable by tools and humans alike: `[db]`, `[conversation]`, `[assistant]`, `[tool]`, `[tool:progress]`, `[memory]`, `[result]`, `[error]`, `[turn]` (final cost + token totals). The CLI shares Mongo with the desktop app, but the SDK session cache is per-process — do not run the CLI against a `conversationId` that the UI is currently streaming.

### Stream concurrency and SDK resume

`src/agent/session.ts` tracks active streams by `conversationId`; concurrent stream requests on the same conversation return `409`. SDK continuity is handled by saving the emitted `sdkSessionId` on the conversation and passing it back as `resume` in query options.

### Secrets

API key flows: SettingsPanel → IPC `secrets:setApiKey` → main → `safeStorage.encryptString` → `app.getPath('userData')/secrets.bin`. On startup, main decrypts and passes `ANTHROPIC_API_KEY` into the server child's env. Never persisted to Mongo. On Linux without a keyring, `safeStorage.isEncryptionAvailable()` returns false and the renderer surfaces an error.

## Key modules

`agent-server/`:

- `src/server.ts` — Express bootstrap, port handoff via `process.parentPort` (Electron utility process IPC).
- `src/agent/session.ts` — active-stream guard used by REST, CLI-adjacent cleanup, and delete/error paths.
- `src/agent/scaffold.ts` — Mongo to `.claude/` writer in overwrite mode; called on server startup and after every Skill/Subagent CRUD.
- `src/agent/sse.ts` — `text/event-stream` writer with 30s heartbeat.
- `src/routes/{conversations,messages,skills,subagents}.ts` — REST + SSE.
- `src/db/{connection,models/*}.ts` — Mongoose. Default-import `mongoose` (named imports break under ESM).
- `src/shared/types.ts` — DTOs and SSE payload shapes; aliased as `@shared/*` from the renderer.
- `util/vars.ts` — `MODELS` and `TOOLS`. `TOOLS.disallowed.join('|')` is the PreToolUse hook matcher regex; not a global block-list.
- `util/hooks.ts` — `protectSensitiveFiles` denies Write/Edit on basenames containing `.env`. Add new sensitive-file rules here.
- `src/main.ts` — CLI runner. Same orchestration code path as the server; see "CLI" section above.

`agent-client/`:

- `src/main/index.ts` — app lifecycle, IPC handlers, runtime CSP, calls `startServerProcess`.
- `src/main/server-process.ts` — `utilityProcess.fork` against `process.resourcesPath/server/src/server.js` in prod; reads `AGENT_SERVER_PORT` in dev.
- `src/main/secrets.ts` — `safeStorage` round-trip for `ANTHROPIC_API_KEY`.
- `src/preload/index.ts` — typed `window.api` (`getServerPort`, `setApiKey`, `hasApiKey`, `getAppVersion`). No raw `ipcRenderer`.
- `src/renderer/src/lib/api.ts` — memoizes `window.api.getServerPort()` and exposes `apiFetch<T>`.
- `src/renderer/src/hooks/useSSE.ts` — `streamPost` reads SSE from a POST response via `fetch().body.getReader()`.
- `src/renderer/src/store/streaming.ts` — Zustand store for in-flight assistant text and tool events.
- `src/renderer/src/components/{Sidebar,ChatView,MessageList,Composer,SettingsPanel}.tsx`.

## Packaging

`electron-builder.yml` ships the compiled server via `extraResources` (not asar) because `utilityProcess.fork` against asar plus native deps (`bson`) is fragile. Resource layout: `resources/server/{src,util}/*.js` plus `resources/server/node_modules/`. If `bson` ends up in the root hoisted `node_modules`, run `npm run rebuild-natives -w agent-client` (calls `electron-builder install-app-deps`) before packaging.

## Conventions

- `npm run typecheck` from the repo root is mandatory. It runs both workspace typechecks.
- New REST endpoints under `agent-server/src/routes/`. Mount in `src/server.ts`.
- New tool-protection rules live in `util/hooks.ts`. Wire matchers via `TOOLS.disallowed` in `util/vars.ts`.
- New skills/subagents go through the Mongo CRUD endpoints (or directly via the SettingsPanel UI). The server scaffolds them to `.claude/` automatically. Do not edit `.claude/agents/*.md` or `.claude/skills/*/SKILL.md` by hand on the server side; they are overwritten on every CRUD call.
- Renderer DTOs live in `agent-server/src/shared/types.ts` and are imported via `@shared/*` (type-only). Don't import runtime values from agent-server into the renderer.

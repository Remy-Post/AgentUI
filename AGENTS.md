# AGENTS.md

Guidance for Codex and other coding agents working in this repository.

AgentUI is currently a wireframe-driven Electron app. Treat the visual prototype and React renderer as the main product surface: preserve the existing style, spacing, language, and interaction patterns unless the user explicitly asks for a redesign. Do not turn wireframe work into a generic production refactor.

## First Read

At the start of each session, read `CLAUDE.md` first, especially the Stack and Project fundamentals sections. This file is a Codex-oriented companion, not a replacement.

## Stack

- Root npm workspaces: `agent-client` and `agent-server`.
- Runtime: Node 20.18+; both workspaces use ESM via `"type": "module"`.
- Language: TypeScript ~5.9.3.
- Desktop: Electron 39, electron-vite 5, electron-builder 26.
- Renderer: React 19, Vite 7, Tailwind v4, TanStack Query, Zustand, `react-markdown`, `remark-gfm`, `lucide-react`.
- Server: Express 5, Mongoose 8, `@anthropic-ai/claude-agent-sdk`.
- Database: local MongoDB at `mongodb://127.0.0.1:27017/agent-desk`; assume `mongod` is running unless evidence says otherwise.
- Streaming: POST endpoints return SSE; renderer consumes streams with `fetch` and `ReadableStream`, not `EventSource`.

## Wireframe Rules

- Follow the existing AgentUI visual system. Keep UI quiet, utilitarian, dense, and consistent with the current panels.
- The standalone `AgentUI Preview.html` and `wireframe_v1.fig` are design references. If the user is discussing visual layout, inspect the preview before changing React.
- If React implementation and preview both represent the same surface, keep them aligned when the requested change clearly applies to both.
- Prefer small, targeted UI changes over broad component rewrites.
- Use `lucide-react` icons for renderer controls when an icon exists.
- Do not introduce marketing pages, hero sections, decorative backgrounds, or one-off visual flourishes.
- Make controls usable at the existing desktop sizes and avoid text overflow in buttons, tabs, cards, and sidebars.

## Project Fundamentals

- `agent-server/` internal relative imports must include `.ts`, e.g. `import { TOOLS } from '../util/vars.ts'`. The compiler rewrites these at emit time.
- `agent-client/` uses bundler resolution; do not add `.ts` extensions there just to match server style.
- Renderer imports from `@shared/*` are type-only and map to `agent-server/src/shared/*`. Never import runtime server values into the renderer.
- Server source of truth for skills and subagents is MongoDB. The server materializes enabled records into `agent-server/.claude/...`; do not hand-edit generated `.claude/agents` or `.claude/skills` files.
- The CLI fallback still scaffolds from `agent-server/util/subagents.ts` and `agent-server/util/skills.ts`. Do not run the CLI and server flows at the same time.
- `process.parentPort` only exists when the server is launched by Electron `utilityProcess.fork`; always guard it with `?.`.
- Secrets are stored through Electron `safeStorage`, not MongoDB.

## Commands

Run commands from the repo root unless there is a specific reason to work inside one workspace.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run server and Electron client in development |
| `npm run cli` | Run the server-side readline fallback |
| `npm run typecheck` | Typecheck both workspaces |
| `npm run build` | Build server and Electron client |
| `npm run build:unpack` | Build unpacked Electron output for inspection |

`npm run typecheck` from the root is mandatory after code changes. If it fails because of pre-existing unrelated work, report that clearly and include the failing area.

## Layout

- `agent-client/`: Electron main/preload plus React renderer.
- `agent-server/`: Express API, Claude Agent SDK session handling, Mongoose models, shared DTOs.
- `storage/`: local runtime data.
- `AgentUI Preview.html`: standalone visual wireframe/reference.
- `wireframe_v1.fig`: source design artifact.

## Key Paths

Server:

- `agent-server/src/server.ts`: Express bootstrap and Electron port handoff.
- `agent-server/src/agent/session.ts`: Claude SDK session cache and hooks.
- `agent-server/src/agent/scaffold.ts`: Mongo-to-`.claude` materialization.
- `agent-server/src/routes/`: REST and SSE routes.
- `agent-server/src/db/models/`: Mongoose models.
- `agent-server/src/shared/types.ts`: shared DTOs and SSE payload types.
- `agent-server/util/hooks.ts`: sensitive-file tool protection.

Client:

- `agent-client/src/main/index.ts`: Electron lifecycle and IPC.
- `agent-client/src/main/server-process.ts`: server child process management.
- `agent-client/src/main/secrets.ts`: API key storage.
- `agent-client/src/preload/index.ts`: typed `window.api`.
- `agent-client/src/renderer/src/lib/api.ts`: renderer API helper.
- `agent-client/src/renderer/src/hooks/useSSE.ts`: POST SSE reader.
- `agent-client/src/renderer/src/store/`: UI and streaming state.
- `agent-client/src/renderer/src/components/`: renderer components.
- `agent-client/src/renderer/src/assets/main.css`: primary renderer styling.

## Working Rules

- Keep edits scoped to the requested behavior.
- Preserve unrelated user changes in the working tree.
- Use existing local patterns before adding abstractions.
- Prefer structured TypeScript and existing DTOs over ad hoc data shapes.
- For server route changes, add or update DTOs in `agent-server/src/shared/types.ts` when renderer-facing data changes.
- For UI changes, inspect nearby components and CSS before editing.
- Do not commit, reset, or discard changes unless the user explicitly asks.


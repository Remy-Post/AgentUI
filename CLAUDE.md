# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Mandatory check

Run `npm run typecheck` (from `agent-server/`) after every modification. Do not consider a change complete until typecheck passes.

## Repository layout

This repo has two top-level apps:

- `agent-server/` — Node CLI that drives the Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`). This is the active codebase.
- `agent-client/` — Electron + React + Tailwind desktop shell. Listed in `.gitignore` (`agent-client/*`), so treat it as untracked / out-of-scope unless the user explicitly asks. Don't propagate changes into it by default.

`storage/` and `.env` are also gitignored.

## Commands (run from `agent-server/`)

| Command | Purpose |
|---|---|
| `npm run dev` | REPL via `tsx watch src/main.ts` — primary dev loop |
| `npm run typecheck` | `tsc --noEmit` — run after every change |
| `npm run build` | `tsc --noCheck` → `dist/` (skips type errors; rely on `typecheck` for safety) |
| `npm run start` | `node dist/src/main.js` against the built output |
| `npm run prod` | `build` + `start` |

There is no test suite and no linter wired up in `agent-server/`. `agent-client/` has its own `npm run lint` / `typecheck` / `dev` (electron-vite) but is not part of the active workflow.

The TS config uses `module: NodeNext` with `allowImportingTsExtensions` + `rewriteRelativeImportExtensions`, so **internal imports must end in `.ts`** (e.g. `import { TOOLS } from '../util/vars.ts'`). `package.json` is `"type": "module"`.

## Architecture

The server is a single REPL process. Entry point: `agent-server/src/main.ts`.

Boot sequence:

1. `dotenv/config` loads `.env`.
2. `ensureSubagentFiles()` and `ensureSkillFiles()` (`util/initHelper.ts`) materialize the in-code agent/skill definitions to `.claude/agents/*.md` and `.claude/skills/*.md` on disk, with YAML frontmatter (via `gray-matter`). Existing files are left alone — this is one-way scaffolding, not sync.
3. `unstable_v2_createSession({ settingSources: ['project'], hooks: { PreToolUse: [...] } })` opens an Agent SDK session that reads the on-disk `.claude/` config the previous step just wrote. Subagents/skills defined in TS are thus exposed to the session through the file system, not the SDK constructor.
4. A `readline` loop sends user input via `session.send()` and switches over the streamed messages (`assistant`, `result`, `tool_use_summary`, `tool_progress`).

Key modules in `agent-server/util/`:

- `vars.ts` — model IDs (`opus = claude-opus-4-7`, `sonnet = claude-sonnet-4-6`, `haiku = claude-haiku-4-5-20251001`) and `TOOLS.allowed` / `TOOLS.disallowed`. `TOOLS.disallowed` is joined into the PreToolUse hook matcher regex; it's not a global tool block-list, just the set of tool names the protection hook runs against.
- `hooks.ts` — `protectSensitiveFiles` PreToolUse callback. Denies any `Write`/`Edit` whose `file_path` basename contains `.env`. Add new sensitive-file rules here, not at call sites.
- `subagents.ts` — `AgentDefinition` records exported as a default object keyed by agent name. The `default` export is what `initHelper` iterates; constants not in that map (e.g. `MAIN_AGENT`) are inert. The commented type definition at the bottom of the file is the source of truth for available fields.
- `skills.ts` — same pattern as subagents, currently empty. Add entries to the default-exported object, not just as named exports.
- `initHelper.ts` — generic file writer. `NON_SERIALIZABLE_KEYS` (`prompt`, `hooks`, `mcpServers`) and functions are stripped from frontmatter; `prompt` becomes the markdown body; `tools` arrays are joined with `, `.

## Conventions

- When adding a subagent or skill, register it in the **default export object** in `subagents.ts` / `skills.ts`. Anything outside that map is not surfaced to the session.
- Generated files in `.claude/agents/` and `.claude/skills/` are treated as the persisted source for the SDK. `initHelper` will not overwrite them — to regenerate, delete the `.md` and restart.
- New tool-protection rules live in `util/hooks.ts`; wire the matcher via `TOOLS.disallowed` in `vars.ts` so the hook actually fires.

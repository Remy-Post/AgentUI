# Google Workspace MCP Wrapper

AgentUI integrates Google Workspace through a project-local MCP server in `agent-server`.
The server wraps the `gws` binary from `@googleworkspace/cli` and exposes structured tools
for Drive, Gmail, Calendar, Sheets, and Docs.

## Why AgentUI Wraps gws

Current `@googleworkspace/cli` releases expose `gws <service> <resource> <method>` and
`gws schema <service.resource.method>`, but `gws mcp` is unavailable in current releases.
The upstream changelog shows that `gws mcp` existed briefly and was removed in `0.8.0`.

AgentUI therefore starts its own stdio MCP server and calls `gws` with argument arrays.
It does not expose raw shell access, raw CLI flags, `gws auth`, `generate-skills`,
`--upload`, `--output`, or arbitrary filesystem-writing behavior.

## Install And Build Behavior

`@googleworkspace/cli`, `@modelcontextprotocol/sdk`, and `zod` are server dependencies.
The server build compiles the MCP wrapper with the rest of `agent-server`.

The wrapper looks for the `gws` binary through `GWS_BINARY_PATH` or `PATH`. AgentUI also
adds local `node_modules/.bin` locations to the MCP server process `PATH` so the npm
dependency can be found during development and packaging when dependencies are bundled.

## Authentication

Authenticate outside AgentUI first:

```sh
gws auth setup
gws auth login -s drive,gmail,calendar,sheets,docs
```

For service-account or exported credentials, point `gws` at a credentials file:

```sh
set GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE=C:\path\to\credentials.json
```

AgentUI does not store Google secrets in MongoDB. If a future UI flow needs to store
Google secrets, it should use Electron `safeStorage`.

## Environment Variables

- `GWS_ALLOWED_SERVICES`: comma-separated service scope for the wrapper, such as
  `drive,gmail,calendar,sheets,docs`. AgentUI sets this per subagent.
- `GWS_BINARY_PATH`: optional path to `gws`; defaults to `gws`.
- `GOOGLE_WORKSPACE_CLI_CONFIG_DIR`: optional gws config directory.
- `GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE`: optional credentials or service-account file.

## Enabling Services In AgentUI

Use Settings -> Tools to enable the Google Workspace service toggles:

- `google.workspace.drive`
- `google.workspace.gmail`
- `google.workspace.calendar`
- `google.workspace.sheets`
- `google.workspace.docs`

All Workspace toggles default to off. The parent orchestrator never receives direct
Google Workspace MCP access. AgentUI attaches the wrapper only to subagents selected for
Workspace tasks, and each subagent receives only the service scope required for its task.


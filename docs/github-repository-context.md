# GitHub Repository Context

AgentUI can add selected GitHub repository files to a single conversation's AI context.
The first version is intentionally local and single-user.

## Authentication

Public repositories work without authentication.

For private repositories, create a fine-grained personal access token in GitHub:

1. Open GitHub Settings -> Developer settings -> Personal access tokens -> Fine-grained tokens.
2. Select only the repositories AgentUI should read.
3. Grant repository permission: **Contents: Read-only**.
4. Paste the token into the Add from GitHub modal.

AgentUI stores the token with Electron `safeStorage`, the same encrypted local storage used
for the Anthropic API key. The token is passed to the local Express server in memory and is
not stored in MongoDB. As a development fallback, `GITHUB_TOKEN` may be set in `.env`.

## Scope

Ingested repository content is scoped to the current conversation. Deleting a conversation
also deletes its GitHub repository sources and chunks. Repository content is treated as
untrusted prompt context and is never executed.

## Limits

Defaults can be overridden with environment variables:

- `GITHUB_MAX_TREE_ENTRIES` default `5000`
- `GITHUB_MAX_SELECTED_FILES` default `200`
- `GITHUB_MAX_REPOSITORY_BYTES` default `25000000`
- `GITHUB_MAX_FILE_BYTES` default `256000`
- `GITHUB_MAX_TOTAL_TEXT_BYTES` default `1200000`
- `GITHUB_MAX_CHUNKS` default `800`
- `GITHUB_MAX_CONTEXT_CHARS` default `24000`
- `GITHUB_CHUNK_CHARS` default `4000`
- `GITHUB_CHUNK_OVERLAP` default `400`

AgentUI skips common dependency, build, generated, binary/media, lockfile, environment,
credential, key, and likely-secret files by default.

## Local Testing

Run:

```sh
npm test -w agent-server
npm run typecheck
```

## Known Limitations

This MVP does not include OAuth sign-in, a GitHub App installation flow, GitHub Enterprise
hosts, embeddings/vector search, or semantic retrieval. Repository context is selected with
bounded keyword/path scoring before each Claude turn.


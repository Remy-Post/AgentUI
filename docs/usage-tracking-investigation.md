# Claude Agent SDK usage tracking investigation

This document quotes the SDK types that drive token and cost attribution in AgentUI. Source files are inside `node_modules/`, version-pinned by `agent-server/package.json` (`@anthropic-ai/claude-agent-sdk ^0.2.114`, which transitively pulls `@anthropic-ai/sdk`).

## 1. `result` event payload

`SDKResultSuccess` carries the canonical per-turn cost, cumulative usage, and a per-model breakdown.

`node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:3138-3158`:

```ts
export declare type SDKResultSuccess = {
    type: 'result';
    subtype: 'success';
    duration_ms: number;
    duration_api_ms: number;
    is_error: boolean;
    api_error_status?: number | null;
    num_turns: number;
    result: string;
    stop_reason: string | null;
    total_cost_usd: number;
    usage: NonNullableUsage;
    modelUsage: Record<string, ModelUsage>;
    permission_denials: SDKPermissionDenial[];
    structured_output?: unknown;
    deferred_tool_use?: SDKDeferredToolUse;
    terminal_reason?: TerminalReason;
    fast_mode_state?: FastModeState;
    uuid: UUID;
    session_id: string;
};
```

`ModelUsage` (`sdk.d.ts:1099-1108`) gives per-model cost and tokens:

```ts
export declare type ModelUsage = {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
    webSearchRequests: number;
    costUSD: number;
    contextWindow: number;
    maxOutputTokens: number;
};
```

`NonNullableUsage` (`sdk.d.ts:1111`) is the same shape as `BetaUsage` (below) with non-nullable fields:

```ts
export declare type NonNullableUsage = {
    [K in keyof BetaUsage]: NonNullable<BetaUsage[K]>;
};
```

**Cardinality**: one `result` per turn. `total_cost_usd` is cumulative across every model call inside the turn (including subagent inner turns). `num_turns` counts every model invocation. `modelUsage` aggregates by model identifier.

## 2. `assistant` event payload

`SDKAssistantMessage` wraps a `BetaMessage` from the underlying Anthropic SDK and exposes per-message token counts and the model that produced them.

`sdk.d.ts:2333-2340`:

```ts
export declare type SDKAssistantMessage = {
    type: 'assistant';
    message: BetaMessage;
    parent_tool_use_id: string | null;
    error?: SDKAssistantMessageError;
    uuid: UUID;
    session_id: string;
};
```

`BetaMessage` (`node_modules/@anthropic-ai/sdk/resources/beta/messages/messages.d.ts:895-1009`) carries `model`, `usage`, and `role`:

```ts
export interface BetaMessage {
    id: string;
    container: BetaContainer | null;
    content: Array<BetaContentBlock>;
    context_management: BetaContextManagementResponse | null;
    model: MessagesAPI.Model;
    role: 'assistant';
    stop_reason: BetaStopReason | null;
    stop_sequence: string | null;
    type: 'message';
    usage: BetaUsage;
}
```

`BetaUsage` (`messages.d.ts:2014-2060`) carries the tokens we record per row, including cache fields:

```ts
export interface BetaUsage {
    cache_creation: BetaCacheCreation | null;
    cache_creation_input_tokens: number | null;
    cache_read_input_tokens: number | null;
    inference_geo: string | null;
    input_tokens: number;
    iterations: BetaIterationsUsage | null;
    output_tokens: number;
    server_tool_use: BetaServerToolUsage | null;
    service_tier: 'standard' | 'priority' | 'batch' | null;
    // ...
}
```

**Per-message attribution is observable but not safe as an additive ledger**. In exported AgentUI conversations, top-level tool-use-only and final-answer assistant events can repeat or partially report the same usage, so summing streamed assistant `usage` values can double-count and produce negative reconciliation deltas. Cost is **not** carried at this level. `parent_tool_use_id` distinguishes top-level assistants (`null`) from subagent inner turns (`string`).

## 3. Subagent / task system messages

Task system messages route through `events.ts` as `tool_progress` SSE events. Their `usage` field is intentionally lightweight and is **not sufficient for cost or per-direction token attribution**.

`sdk.d.ts:3401-3418` (`SDKTaskProgressMessage`):

```ts
export declare type SDKTaskProgressMessage = {
    type: 'system';
    subtype: 'task_progress';
    task_id: string;
    tool_use_id?: string;
    description: string;
    usage: {
        total_tokens: number;
        tool_uses: number;
        duration_ms: number;
    };
    last_tool_name?: string;
    summary?: string;
    uuid: UUID;
    session_id: string;
};
```

`sdk.d.ts:3383-3399` (`SDKTaskNotificationMessage`) carries the same lightweight `usage?` optional. Neither carries `cost_usd`, `input_tokens`, `output_tokens`, `cache_*`, or `model`.

`SDKTaskStartedMessage` and `SDKTaskUpdatedMessage` (`sdk.d.ts:3419-3457`) carry no usage at all.

**Practical consequence**: subagent activity is not directly attributable to a `Message` row from the system message stream. However, every subagent inner model call still emits a regular `assistant` event with `parent_tool_use_id` set, and the `result.usage` and `result.total_cost_usd` aggregate everything including subagent work. AgentUI attributes per-row tokens and cost only to top-level assistants (where `parent_tool_use_id == null`); subagent work surfaces in the `Conversation` totals via `result.usage`.

## 4. Plan implications

- **Schemas**: `Message` gets optional `inputTokens`, `outputTokens`, `cacheCreationInputTokens`, `cacheReadInputTokens`, `model`. `Conversation` gets `totalInputTokens`, `totalOutputTokens`, `totalCacheCreationInputTokens`, `totalCacheReadInputTokens` (default 0).
- **Per-turn tokens**: written once from `result.usage`, stamped onto the last visible top-level assistant message for the turn. If a turn has no visible top-level assistant text, write a hidden `{ kind: 'turn_usage' }` accounting row.
- **Per-turn cost**: written once from `result.total_cost_usd` to the same visible assistant or hidden accounting row.
- **Conversation totals**: incremented from `result.usage` (cumulative, includes subagent work), so the conversation total stays correct even when per-row attribution is scoped to top-level only.
- **Aggregation**: `/api/usage` aggregates from `Message` accounting rows (visible assistant rows with result totals plus hidden `turn_usage` rows), with a `$lookup` onto `Conversation` for `recentRuns` titles.

## 5. Type entry point

Canonical TypeScript entry point for the SDK: `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`. The exported `SDKMessage` union (line 2986) lists every event variant.

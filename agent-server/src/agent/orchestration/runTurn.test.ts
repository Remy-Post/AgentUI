import test from 'node:test'
import assert from 'node:assert/strict'
import type { SDKAssistantMessage } from '@anthropic-ai/claude-agent-sdk'
import { planAssistantMessagePersistence, writePassthroughEventToSse } from './runTurn.ts'
import type { SSEHandle } from '../sse.ts'

test('forwards SDK memory recall events to SSE', () => {
  const writes: Array<{ name: string; data: unknown }> = []
  const sse: Pick<SSEHandle, 'write'> = {
    write: (name, data) => writes.push({ name, data }),
  }
  const data = {
    mode: 'select',
    memories: [{ path: '/tmp/memory.md', scope: 'personal', content: 'Remember this.' }],
  }

  const forwarded = writePassthroughEventToSse({ name: 'memory_recall', data }, sse)

  assert.equal(forwarded, true)
  assert.deepEqual(writes, [{ name: 'memory_recall', data }])
})

test('skips top-level tool-use-only assistant messages for persistence', () => {
  const message = {
    type: 'assistant',
    parent_tool_use_id: null,
    message: {
      model: 'claude-haiku-4-5',
      content: [{ type: 'tool_use', id: 'toolu_1', name: 'Agent', input: {} }],
    },
  } as unknown as SDKAssistantMessage

  assert.deepEqual(planAssistantMessagePersistence(message), { kind: 'skip' })
})

test('plans visible top-level assistant text for a single stamped row', () => {
  const message = {
    type: 'assistant',
    parent_tool_use_id: null,
    message: {
      model: 'claude-haiku-4-5',
      content: [
        { type: 'text', text: 'Visible answer.' },
        { type: 'tool_use', id: 'toolu_1', name: 'Agent', input: {} },
      ],
    },
  } as unknown as SDKAssistantMessage

  assert.deepEqual(planAssistantMessagePersistence(message), {
    kind: 'top_level_visible',
    content: 'Visible answer.',
    model: 'claude-haiku-4-5',
  })
})

test('plans nested assistant text without creating a turn usage target', () => {
  const message = {
    type: 'assistant',
    parent_tool_use_id: 'toolu_parent',
    message: {
      model: 'claude-haiku-4-5',
      content: [{ type: 'text', text: 'Nested note.' }],
    },
  } as unknown as SDKAssistantMessage

  assert.deepEqual(planAssistantMessagePersistence(message), {
    kind: 'nested_visible',
    content: 'Nested note.',
  })
})

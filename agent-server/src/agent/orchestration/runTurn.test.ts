import test from 'node:test'
import assert from 'node:assert/strict'
import { writePassthroughEventToSse } from './runTurn.ts'
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

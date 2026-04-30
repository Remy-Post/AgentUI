import test from 'node:test'
import assert from 'node:assert/strict'
import { isValidSubagentMemoryScope, validateSubagentMemoryUpdate } from './subagents.ts'

test('subagent memory update validation accepts only SDK memory scopes', () => {
  for (const scope of ['user', 'project', 'local', 'none']) {
    assert.equal(isValidSubagentMemoryScope(scope), true)
    assert.equal(validateSubagentMemoryUpdate({ memory: scope }), null)
  }

  assert.equal(isValidSubagentMemoryScope('team'), false)
  assert.equal(validateSubagentMemoryUpdate({ memory: 'team' }), 'invalid_memory_scope')
  assert.equal(validateSubagentMemoryUpdate({ name: 'research_agent' }), null)
})

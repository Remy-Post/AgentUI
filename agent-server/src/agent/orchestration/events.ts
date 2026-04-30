import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import type { SSEEventName, SSEMemoryRecallMemory } from '../../shared/types.ts'

export type NormalizedStreamEvent = {
  name: SSEEventName
  data: Record<string, unknown>
}

function contentTextBlocks(content: unknown): string {
  if (!Array.isArray(content)) return ''
  return content
    .filter((block): block is { type?: string; text?: string } => {
      return typeof block === 'object' && block !== null && (block as { type?: string }).type === 'text'
    })
    .map((block) => block.text ?? '')
    .join('')
}

export function extractAssistantText(message: SDKMessage): string {
  if (message.type !== 'assistant') return ''
  return contentTextBlocks(message.message?.content)
}

export function extractSessionId(message: unknown): string | null {
  if (!message || typeof message !== 'object') return null
  const sessionId = (message as { session_id?: unknown }).session_id
  return typeof sessionId === 'string' && sessionId.length > 0 ? sessionId : null
}

function stringField(value: unknown, names: string[]): string | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  for (const name of names) {
    const field = record[name]
    if (typeof field === 'string' && field.trim()) return field
  }
  return undefined
}

function nestedStringField(value: unknown, objectNames: string[], fieldNames: string[]): string | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  for (const objectName of objectNames) {
    const found = stringField(record[objectName], fieldNames)
    if (found) return found
  }
  return undefined
}

function toolProgressData(
  toolName: string,
  message: SDKMessage,
  status?: string,
): Record<string, unknown> {
  const taskId = stringField(message, ['task_id', 'taskId'])
  const agentId = stringField(message, ['agent_id', 'agentID'])
  const agentName =
    stringField(message, ['agent_name', 'agentName', 'subagent_name', 'subagentName'])
    ?? nestedStringField(message, ['agent', 'subagent'], ['name', 'agent_name', 'agentName'])
  const description = stringField(message, ['description', 'message'])

  return {
    tool_name: toolName,
    ...(taskId ? { task_id: taskId } : {}),
    ...(agentId ? { agent_id: agentId } : {}),
    ...(agentName ? { agent_name: agentName } : {}),
    ...(status ? { status } : {}),
    ...(description ? { description } : {}),
    raw: message,
  }
}

export function normalizeSdkMessage(message: SDKMessage): NormalizedStreamEvent | null {
  switch (message.type) {
    case 'assistant': {
      return { name: 'assistant', data: { text: extractAssistantText(message), raw: message } }
    }
    case 'result': {
      const totalCost = (message as { total_cost_usd?: number }).total_cost_usd
      const errors = (message as { errors?: string[] }).errors
      const isError = (message as { is_error?: boolean }).is_error === true
      return {
        name: 'result',
        data: {
          status: isError ? 'error' : 'done',
          total_cost_usd: totalCost,
          ...(isError ? { error: Array.isArray(errors) ? errors.join('\n') : 'sdk_result_error' } : {}),
        },
      }
    }
    case 'tool_use_summary': {
      return { name: 'tool_use_summary', data: { summary: (message as { summary?: unknown }).summary } }
    }
    case 'tool_progress': {
      const toolName = (message as { tool_name?: string }).tool_name ?? 'unknown'
      return {
        name: 'tool_progress',
        data: toolProgressData(toolName, message, 'running'),
      }
    }
    case 'system': {
      const subtype = (message as { subtype?: string }).subtype
      if (subtype === 'memory_recall') {
        const memoryMessage = message as {
          mode?: 'select' | 'synthesize'
          memories?: SSEMemoryRecallMemory[]
        }
        return {
          name: 'memory_recall',
          data: {
            mode: memoryMessage.mode ?? 'select',
            memories: Array.isArray(memoryMessage.memories) ? memoryMessage.memories : [],
            raw: message,
          },
        }
      }
      if (subtype === 'task_started') {
        return {
          name: 'tool_progress',
          data: toolProgressData('Agent', message, 'started'),
        }
      }
      if (subtype === 'task_progress') {
        const toolName = (message as { last_tool_name?: string }).last_tool_name ?? 'Agent'
        return {
          name: 'tool_progress',
          data: toolProgressData(toolName, message, 'running'),
        }
      }
      if (subtype === 'task_notification' || subtype === 'task_updated') {
        return {
          name: 'tool_progress',
          data: toolProgressData('Agent', message, subtype === 'task_updated' ? 'updated' : 'notification'),
        }
      }
      return null
    }
    default:
      return null
  }
}

import { query } from '@anthropic-ai/claude-agent-sdk'
import { Conversation } from '../../db/models/Conversation.ts'
import { Message } from '../../db/models/Message.ts'
import { dropSession } from '../session.ts'
import { extractAssistantText } from './events.ts'

const MAX_RAW_CHARS = 60_000
const MAX_PER_MESSAGE_CHARS = 4_000

const COMPRESS_SYSTEM_PROMPT = [
  'You compress conversation transcripts.',
  'Produce a faithful, concise summary that preserves: the user\'s goals, decisions made, code paths and identifiers discussed, open questions, and any commitments still in flight.',
  'Output plain text. No headings unless they aid scanning. Aim for ~400-800 words.',
  'Do not invent details. If something is unclear in the transcript, mark it as unclear rather than guessing.',
].join('\n')

type CompressInput = {
  conversationId: string
  conversationModel: string
}

export type CompressResult = {
  summary: string
  archivedMessageCount: number
  summaryMessageId: string
}

function stringifyContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (content == null) return ''
  try {
    return JSON.stringify(content)
  } catch {
    return String(content)
  }
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value
  return `${value.slice(0, max)}…`
}

function buildTranscript(messages: { role: string; content: unknown; createdAt?: Date }[]): string {
  const lines: string[] = []
  let total = 0
  for (const m of messages) {
    const body = truncate(stringifyContent(m.content), MAX_PER_MESSAGE_CHARS)
    const line = `[${m.role}] ${body}`
    if (total + line.length > MAX_RAW_CHARS) {
      lines.push('… (older messages truncated for length) …')
      break
    }
    lines.push(line)
    total += line.length + 1
  }
  return lines.join('\n\n')
}

async function summarize(transcript: string, model: string): Promise<string> {
  const stream = query({
    prompt: `Summarize the following conversation:\n\n${transcript}`,
    options: {
      model,
      systemPrompt: COMPRESS_SYSTEM_PROMPT,
      settingSources: [],
      permissionMode: 'dontAsk',
      allowedTools: [],
      disallowedTools: ['*'],
      agentProgressSummaries: false,
      forwardSubagentText: false,
    },
  })
  let summary = ''
  try {
    for await (const message of stream) {
      if (message.type === 'assistant') {
        summary += extractAssistantText(message)
      }
    }
  } finally {
    stream.close()
  }
  const trimmed = summary.trim()
  if (!trimmed) throw new Error('compress_empty_summary')
  return trimmed
}

export async function compressConversation({
  conversationId,
  conversationModel,
}: CompressInput): Promise<CompressResult> {
  const messages = await Message.find({ conversationId })
    .sort({ createdAt: 1 })
    .lean<{ role: string; content: unknown; createdAt?: Date }[]>()
  if (messages.length === 0) throw new Error('compress_no_messages')

  const transcript = buildTranscript(messages)
  const summary = await summarize(transcript, conversationModel)

  const created = await Message.create({
    conversationId,
    role: 'system',
    content: { kind: 'compaction', summary, archivedCount: messages.length },
  })

  await Conversation.updateOne(
    { _id: conversationId },
    { $unset: { sdkSessionId: 1 }, $set: { updatedAt: new Date() } },
  )
  dropSession(conversationId)

  return {
    summary,
    archivedMessageCount: messages.length,
    summaryMessageId: String(created._id),
  }
}

import 'dotenv/config'
import * as readline from 'node:readline'
import mongoose from 'mongoose'
import { connectDb, disconnectDb } from './db/connection.ts'
import { Conversation } from './db/models/Conversation.ts'
import { Message } from './db/models/Message.ts'
import { runConversationTurn } from './agent/orchestration/runTurn.ts'
import type { SSEHandle } from './agent/sse.ts'
import type { SSEEventName } from './shared/types.ts'
import { MODELS, normalizeModelClass, resolveLatestModelId } from '../util/vars.ts'

type Args = {
  prompt?: string
  conversationId?: string
  model?: string
  help?: boolean
}

function parseArgs(argv: string[]): Args {
  const out: Args = {}
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = (): string | undefined => {
      const value = argv[i + 1]
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`${arg} requires a value`)
      }
      i += 1
      return value
    }
    switch (arg) {
      case '--prompt':
      case '-p':
        out.prompt = next()
        break
      case '--conversation':
      case '-c':
        out.conversationId = next()
        break
      case '--model':
      case '-m':
        out.model = next()
        break
      case '--help':
      case '-h':
        out.help = true
        break
      default:
        throw new Error(`Unknown argument: ${arg}`)
    }
  }
  return out
}

const HELP = `agent-server CLI — runs the same orchestration code path as the Express server.

Usage:
  npm run cli                                          interactive REPL, new conversation
  npm run cli -- --prompt "your message"               single-shot, new conversation
  npm run cli -- --conversation <id>                   resume existing conversation (REPL)
  npm run cli -- --conversation <id> --prompt "..."    single-shot against existing conversation

Flags:
  -p, --prompt <text>          single-shot mode; runs one turn then exits
  -c, --conversation <id>      Mongo conversation _id to resume; default: create new
  -m, --model <id>             model id (only used when creating a new conversation)
  -h, --help                   show this message

Output: bracketed event lines on stdout — [assistant], [tool], [tool:progress],
[memory], [result], [error], [turn] — designed for both human reading and
parsing by other AI agents (Codex / Claude Code / Gemini) that drive backend
debugging through this CLI.
`

function resolveModel(arg: string | undefined): string {
  if (!arg) return MODELS.sonnet
  if (arg in MODELS) return MODELS[arg as keyof typeof MODELS]
  if (arg.startsWith('claude-')) return arg
  return resolveLatestModelId(normalizeModelClass(arg))
}

function shortJson(value: unknown, max = 160): string {
  let s: string
  try {
    s = JSON.stringify(value)
  } catch {
    s = String(value)
  }
  if (s.length <= max) return s
  return `${s.slice(0, max - 1)}…`
}

function createCliSse(): SSEHandle {
  const write = (name: SSEEventName, data: unknown): void => {
    const d = data as Record<string, unknown>
    switch (name) {
      case 'assistant': {
        const text = typeof d.text === 'string' ? d.text : ''
        if (text.trim()) process.stdout.write(`\n[assistant]\n${text}\n`)
        break
      }
      case 'tool_use_summary': {
        const summary = typeof d.summary === 'string' ? d.summary : shortJson(d)
        process.stdout.write(`[tool] ${summary}\n`)
        break
      }
      case 'tool_progress': {
        const toolName = typeof d.tool_name === 'string' ? d.tool_name : 'tool'
        process.stdout.write(`[tool:progress] ${toolName} ${shortJson(d)}\n`)
        break
      }
      case 'memory_recall': {
        const memories = Array.isArray(d.memories) ? d.memories.length : 0
        const mode = typeof d.mode === 'string' ? d.mode : '?'
        process.stdout.write(`[memory] mode=${mode} count=${memories}\n`)
        break
      }
      case 'result': {
        const status = typeof d.status === 'string' ? d.status : '?'
        const cost = typeof d.total_cost_usd === 'number' ? d.total_cost_usd : null
        process.stdout.write(
          `[result] status=${status}${cost !== null ? ` cost=$${cost.toFixed(4)}` : ''}\n`,
        )
        break
      }
      case 'error': {
        const message = typeof d.message === 'string' ? d.message : shortJson(d)
        process.stdout.write(`[error] ${message}\n`)
        break
      }
    }
  }
  return { write, close: () => {} }
}

async function loadOrCreateConversation(args: Args): Promise<{ doc: InstanceType<typeof Conversation>; created: boolean }> {
  if (args.conversationId) {
    if (!mongoose.isValidObjectId(args.conversationId)) {
      throw new Error(`Invalid conversation id: ${args.conversationId}`)
    }
    const doc = await Conversation.findById(args.conversationId)
    if (!doc) throw new Error(`Conversation not found: ${args.conversationId}`)
    return { doc, created: false }
  }
  const model = resolveModel(args.model)
  const title = `cli-${new Date().toISOString().replace(/[:]/g, '-')}`
  const doc = await Conversation.create({ title, model })
  return { doc, created: true }
}

async function runTurn(
  conversationDoc: InstanceType<typeof Conversation>,
  content: string,
): Promise<void> {
  const conversationId = String(conversationDoc._id)
  await Message.create({ conversationId, role: 'user', content })
  await Conversation.updateOne({ _id: conversationId }, { $set: { updatedAt: new Date() } })

  const sse = createCliSse()
  let turnResult: Awaited<ReturnType<typeof runConversationTurn>> | undefined
  try {
    turnResult = await runConversationTurn({
      conversationId,
      content,
      conversation: conversationDoc,
      sse,
      isClosed: () => false,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await Message.create({ conversationId, role: 'system', content: { kind: 'error', message } })
    sse.write('error', { message })
  } finally {
    sse.close()
    if (turnResult && typeof turnResult.totalCostUsd === 'number') {
      await Conversation.updateOne(
        { _id: conversationId },
        {
          $inc: {
            totalCostUsd: turnResult.totalCostUsd,
            totalInputTokens: turnResult.totalInputTokens ?? 0,
            totalOutputTokens: turnResult.totalOutputTokens ?? 0,
            totalCacheCreationInputTokens: turnResult.totalCacheCreationInputTokens ?? 0,
            totalCacheReadInputTokens: turnResult.totalCacheReadInputTokens ?? 0,
          },
        },
      )
      const cost = turnResult.totalCostUsd.toFixed(4)
      const inTok = turnResult.totalInputTokens ?? 0
      const outTok = turnResult.totalOutputTokens ?? 0
      const ccTok = turnResult.totalCacheCreationInputTokens ?? 0
      const crTok = turnResult.totalCacheReadInputTokens ?? 0
      process.stdout.write(
        `[turn] cost=$${cost} in=${inTok} out=${outTok} cache_create=${ccTok} cache_read=${crTok}\n`,
      )
    }
  }
}

async function repl(conversationDoc: InstanceType<typeof Conversation>): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const ask = (q: string): Promise<string> => new Promise((resolve) => rl.question(q, resolve))
  process.stdout.write('REPL mode. Type "exit" or press Ctrl-D to quit.\n')
  try {
    while (true) {
      let line: string
      try {
        line = await ask('\n> ')
      } catch {
        break
      }
      const text = line.trim()
      if (!text) continue
      if (text === 'exit' || text === 'quit') break
      await runTurn(conversationDoc, text)
    }
  } finally {
    rl.close()
  }
}

async function main(): Promise<void> {
  let args: Args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n\n${HELP}`)
    process.exit(2)
  }

  if (args.help) {
    process.stdout.write(HELP)
    return
  }

  await connectDb()
  process.stdout.write('[db] up\n')

  const { doc, created } = await loadOrCreateConversation(args)
  process.stdout.write(
    `[conversation] ${created ? 'created' : 'resumed'} id=${String(doc._id)} model=${doc.model}\n`,
  )

  try {
    if (args.prompt) {
      await runTurn(doc, args.prompt)
    } else {
      await repl(doc)
    }
  } finally {
    await disconnectDb()
  }
}

main().catch(async (error) => {
  process.stderr.write(`fatal: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
  try {
    await disconnectDb()
  } catch {
    // ignore
  }
  process.exit(1)
})

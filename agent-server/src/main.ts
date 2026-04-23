import 'dotenv/config'
import * as readline from 'readline'
import {
    SDKToolProgressMessage,
    SDKToolUseSummaryMessage,
  unstable_v2_createSession,
  type SDKAssistantMessage,
  type SDKResultMessage
} from '@anthropic-ai/claude-agent-sdk'

import { TOOLS, MODELS } from '../util/vars.ts'
import { protectSensitiveFiles } from './hooks.ts'

if (!process.env.ANTHROPIC_API_KEY) {
  console.log('No ANTHROPIC_API_KEY found — using Claude subscription auth.')
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

const prompt = (question: string): Promise<string> =>
  new Promise((resolve) => rl.question(question, resolve))

await using session = unstable_v2_createSession({
    model: MODELS.opus,
    allowedTools: [...TOOLS.allowed],
    disallowedTools: [...TOOLS.disallowed],
    hooks: {
      PreToolUse: [ {matcher: 'Write|Edit|Read', hooks: [protectSensitiveFiles]} ],
    }
  })

console.log('Conversation started. Type "exit" to quit.\n')

while (true) {
  const userInput = await prompt('You: ')

  if (userInput.trim().toLowerCase() === 'exit') {
    console.log('Goodbye!')
    break
  }

  if (!userInput.trim()) continue

  await session.send(userInput)

  for await (const message of session.stream()) {
    try {
        switch (message.type) {
            case 'assistant':
            {
                handleAssistantMessage(message)
                break
            }
            case 'result':
            {
                handleResultMessage(message)
                break
            }
            case 'tool_use_summary':
            {
                handleToolUseSummaryMessage(message)
                break
            }
            case 'tool_progress':
            {
                handleToolProgressMessage(message)
                break
            }
            default:
                console.log(message)
                break
        }
    } catch (error){
        console.error(error)
    }
  }
}

rl.close()


function handleAssistantMessage(message: SDKAssistantMessage): void {
    const text = message.message.content
        .filter((block) => block.type === 'text')
        .map((block) => (block as { type: 'text'; text: string }).text)
        .join('')
    if (text) console.log(`\nAssistant: ${text}\n`)
}

function handleResultMessage(message: SDKResultMessage): void {
    console.log(`Total cost: $${message.total_cost_usd}`)
}

function handleToolUseSummaryMessage(message: SDKToolUseSummaryMessage): void {
    console.log('[Tool summary]', message.summary)
}

function handleToolProgressMessage(message: SDKToolProgressMessage): void {
    console.log(`[Tool] ${message.tool_name}`)
}

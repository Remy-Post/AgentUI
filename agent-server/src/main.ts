import 'dotenv/config'
import {
    SDKToolProgressMessage,
    SDKToolUseSummaryMessage,
  unstable_v2_createSession,
  type HookCallback,
  type HookJSONOutput,
  type SDKAssistantMessage,
  type SDKResultMessage
} from '@anthropic-ai/claude-agent-sdk'



import { TOOLS, MODELS } from '../util/vars.ts'
import { protectSensitiveFiles, preCompactHook } from './hooks.ts'


await using session = unstable_v2_createSession({
    model: MODELS.opus,
    allowedTools: [...TOOLS.allowed],
    disallowedTools: [...TOOLS.disallowed],
    hooks: {
      PreToolUse: [ {matcher: 'Write|Edit|Read', hooks: [protectSensitiveFiles]} ],
      // PreCompact: [ {matcher: 'Write|Edit|Read', hooks: [preCompactHook]} ]
    }
  })

// Send the initial message
  await session.send('Hello, how are you? What do you think about the modern day')

  //Agent loop 
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

    }catch (error){
        console.error(error)
    }
    finally {
        console.log('Agent loop finished')
    }
  }



function handleAssistantMessage(message: SDKAssistantMessage): void {
    console.log(message.message)
}
function handleResultMessage(message: SDKResultMessage): void {
    console.log("Result Message:", message)
    console.log(`Total cost: $${message.total_cost_usd}`)
}
function handleToolUseSummaryMessage(message: SDKToolUseSummaryMessage): void {
    console.error(message.summary)
}
function handleToolProgressMessage(message: SDKToolProgressMessage): void {
    console.log(message.tool_name,"\n---\n", message?.parent_tool_use_id,"\n---\n\n",)
}
// Tools Protection
import { SyncHookJSONOutput, type HookCallback, type HookJSONOutput } from '@anthropic-ai/claude-agent-sdk'




export const protectSensitiveFiles: HookCallback = async (input) => {
  if (input.hook_event_name !== 'PreToolUse') return {}

  const toolInput = input.tool_input as { file_path?: string; path?: string }
  const filePath = toolInput.file_path ?? toolInput.path ?? ''
  const fileName = filePath.split(/[/\\]/).pop() ?? ''

  if (
    [".env", ".env.local", ".env.development.local", ".env.test.local", ".env.development", ".env.test", ".env.production.local"].includes(fileName)
    ) {
    return {
        hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: 'Cannot modify sensitive files'
        }
    }
  }

  return {}
}

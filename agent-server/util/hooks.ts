// Tools Protection
import { SyncHookJSONOutput, type HookCallback, type HookJSONOutput } from '@anthropic-ai/claude-agent-sdk'




export const protectSensitiveFiles: HookCallback = async (input) => {
  if (input.hook_event_name !== 'PreToolUse') return {}

  const toolInput = input.tool_input as { file_path?: string; path?: string }
  const filePath = toolInput.file_path ?? toolInput.path ?? ''
  const fileName = filePath.split(/[/\\]/).pop() ?? ''

  if (
    fileName.includes('.env')
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

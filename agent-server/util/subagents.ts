import { type AgentDefinition } from '@anthropic-ai/claude-agent-sdk'
import { MODELS, TOOLS } from './vars.ts'
import { protectSensitiveFiles } from './hooks.ts'


export const MAIN_AGENT: AgentDefinition = {
    description: 'A subagent that can be used to send emails',
    prompt: 'You are a subagent that can be used to send emails',
    model: MODELS.opus,
    maxTurns: 1000,
    memory: 'local',
    effort: 'max',
    permissionMode: 'bypassPermissions',
} as const

//------------ Subagents ------------



export const EXMAIL_AGENT: AgentDefinition = {
    description: 'A subagent that can be used to send emails',

    prompt: 'You are a subagent that can be used to send emails',
    initialPrompt: 'You are a subagent that can be used to send emails',

    hooks: {
        PreToolUse: [ {matcher: TOOLS.disallowed.join('|'), hooks: [protectSensitiveFiles]} ]
    },
    model: MODELS.sonnet,
    maxTurns: 1000,
    memory: 'local',
    effort: 'low',
    permissionMode: 'bypassPermissions',
    criticalSystemReminder_EXPERIMENTAL: 'You are a subagent that can be used scan through most emails',
} as const

export const FILE_SCANNER_AGENT: AgentDefinition = {
    description: 'A subagent that can be used to scan through files',
    prompt: 'You are a subagent that can be used to scan through files',
    model: MODELS.haiku,
    maxTurns: 1000,
    memory: 'local',
    effort: 'low',
    permissionMode: 'bypassPermissions',
    criticalSystemReminder_EXPERIMENTAL: 'You are a subagent that can be used to scan through files',
} as const



export default {
    'email_agent': EXMAIL_AGENT,
    'file_scanner_agent': FILE_SCANNER_AGENT,
} as const satisfies Record<string, AgentDefinition>

// type AgentDefinition = {
//     description: string;
//     tools?: string[];
//     disallowedTools?: string[];
//     prompt: string;
//     model?: string;
//     mcpServers?: AgentMcpServerSpec[];
//     skills?: string[];
//     initialPrompt?: string;
//     maxTurns?: number;
//     background?: boolean;
//     memory?: "user" | "project" | "local";
//     effort?: "low" | "medium" | "high" | "xhigh" | "max" | number;
//     permissionMode?: PermissionMode;
//     criticalSystemReminder_EXPERIMENTAL?: string;
//   };
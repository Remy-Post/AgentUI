export const MODELS = {
    opus: 'claude-opus-4-7',
    sonnet: 'claude-sonnet-4-6',
    haiku: 'claude-haiku-4-5-20251001'
  } as const
  
  export const TOOLS = {
    allowed: ['Read', 'Bash'],
    disallowed: ['Write', 'Edit']
  } as const
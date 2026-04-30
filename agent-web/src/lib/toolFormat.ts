function shortenArgs(args: unknown): string {
  if (typeof args === 'string') return args
  if (args && typeof args === 'object') {
    const entries = Object.entries(args as Record<string, unknown>)
    return entries
      .slice(0, 3)
      .map(([k, v]) => {
        const str = typeof v === 'string' ? v : JSON.stringify(v)
        return `${k}=${str.length > 24 ? `${str.slice(0, 23)}…` : str}`
      })
      .join(', ')
  }
  return ''
}

function truncate(s: string, n = 80): string {
  if (s.length <= n) return s
  return `${s.slice(0, n - 1).trimEnd()}…`
}

export function formatToolContent(content: unknown): string {
  if (content === null || content === undefined) return 'tool'

  if (typeof content === 'string') return truncate(content)

  if (typeof content === 'object') {
    const obj = content as Record<string, unknown>

    // Server-persisted shape: { kind: 'summary', summary } — recurse on summary.
    if (obj.kind === 'summary' && 'summary' in obj) {
      return formatToolContent(obj.summary)
    }

    // Server-persisted error shape: { kind: 'error', message }
    if (obj.kind === 'error' && typeof obj.message === 'string') {
      return truncate(`error: ${obj.message}`)
    }

    // Object with tool_name + args / input / arg_summary.
    if (typeof obj.tool_name === 'string') {
      const argSrc = obj.arg_summary ?? obj.args ?? obj.input ?? obj.summary
      const argStr = shortenArgs(argSrc)
      return truncate(argStr ? `${obj.tool_name} → ${argStr}` : obj.tool_name)
    }

    return truncate(JSON.stringify(content))
  }

  return truncate(String(content))
}

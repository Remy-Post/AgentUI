export function formatRelativeTime(input: string | Date): string {
  const date = typeof input === 'string' ? new Date(input) : input
  const now = Date.now()
  const diffMs = now - date.getTime()
  const sec = Math.round(diffMs / 1000)
  if (sec < 60) return 'now'
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h`
  const day = Math.round(hr / 24)
  if (day === 1) return 'yest'
  if (day < 7) return `${day}d`
  const wk = Math.round(day / 7)
  if (wk < 5) return `${wk}w`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const startedFormatter = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  day: '2-digit',
  month: 'short'
})

export function formatStartedAt(input: string | Date): string {
  const date = typeof input === 'string' ? new Date(input) : input
  const parts = startedFormatter.formatToParts(date)
  const time = `${parts.find((p) => p.type === 'hour')?.value}:${parts.find((p) => p.type === 'minute')?.value}`
  const day = parts.find((p) => p.type === 'day')?.value ?? ''
  const month = parts.find((p) => p.type === 'month')?.value ?? ''
  return `${time} · ${day} ${month}`
}

export function formatUsd(n: number): string {
  if (n === 0) return '$0.000'
  if (n < 0.001) return `$${n.toFixed(5)}`
  if (n < 1) return `$${n.toFixed(3)}`
  return `$${n.toFixed(2)}`
}

export function truncate(s: string, n: number): string {
  if (s.length <= n) return s
  return `${s.slice(0, n - 1).trimEnd()}…`
}

export function formatModelFamily(model: string): string {
  const low = model.toLowerCase()
  if (low.includes('opus')) return 'Opus'
  if (low.includes('sonnet')) return 'Sonnet'
  if (low.includes('haiku')) return 'Haiku'
  return model
}

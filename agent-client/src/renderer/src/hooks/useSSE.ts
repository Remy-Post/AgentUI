import { getServerUrl } from '../lib/api'

export type SSEHandler = (event: string, data: unknown) => void

export type StreamOptions = {
  signal?: AbortSignal
  onEvent: SSEHandler
}

// fetch-based SSE reader because EventSource is GET-only and our endpoint
// is POST (the server treats sending the user message and streaming the turn
// as a single transaction).
export async function streamPost(path: string, body: unknown, opts: StreamOptions): Promise<void> {
  const res = await fetch(await getServerUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(body),
    signal: opts.signal
  })

  if (!res.ok || !res.body) {
    throw new Error(`stream_failed_${res.status}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let separatorIndex
    while ((separatorIndex = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, separatorIndex)
      buffer = buffer.slice(separatorIndex + 2)
      dispatchBlock(block, opts.onEvent)
    }
  }
}

function dispatchBlock(block: string, onEvent: SSEHandler): void {
  if (!block || block.startsWith(':')) return
  let eventName = 'message'
  const dataLines: string[] = []
  for (const line of block.split('\n')) {
    if (line.startsWith('event: ')) {
      eventName = line.slice(7).trim()
    } else if (line.startsWith('data: ')) {
      dataLines.push(line.slice(6))
    }
  }
  if (dataLines.length === 0) return
  const raw = dataLines.join('\n')
  try {
    onEvent(eventName, JSON.parse(raw))
  } catch {
    onEvent(eventName, raw)
  }
}

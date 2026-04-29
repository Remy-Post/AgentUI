let portPromise: Promise<number | null> | null = null

export async function getServerOrigin(): Promise<string | null> {
  if (!portPromise) {
    portPromise = window.api.getServerPort()
  }
  const port = await portPromise
  if (typeof port !== 'number') return null
  return `http://127.0.0.1:${port}`
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const origin = await getServerOrigin()
  if (!origin) throw new Error('server_not_ready')
  const res = await fetch(`${origin}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`request_failed_${res.status}_${text}`)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

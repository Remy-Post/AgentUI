import type {
  CreateMemoryRequest,
  MemoryDTO,
  MemoryType,
  UpdateMemoryRequest
} from '@shared/types'

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

export type ListMemoriesParams = {
  search?: string
  type?: MemoryType | ''
  tag?: string
}

export async function listMemories(params: ListMemoriesParams = {}): Promise<MemoryDTO[]> {
  const query = new URLSearchParams()
  const search = params.search?.trim()
  const tag = params.tag?.trim()
  if (search) query.set('search', search)
  if (params.type) query.set('type', params.type)
  if (tag) query.set('tag', tag)

  const suffix = query.toString()
  return apiFetch<MemoryDTO[]>(`/api/memories${suffix ? `?${suffix}` : ''}`)
}

export async function createMemory(body: CreateMemoryRequest): Promise<MemoryDTO> {
  return apiFetch<MemoryDTO>('/api/memories', {
    method: 'POST',
    body: JSON.stringify(body)
  })
}

export async function updateMemory(id: string, body: UpdateMemoryRequest): Promise<MemoryDTO> {
  return apiFetch<MemoryDTO>(`/api/memories/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body)
  })
}

export async function deleteMemory(id: string): Promise<void> {
  return apiFetch<void>(`/api/memories/${id}`, { method: 'DELETE' })
}

import type {
  CreateMemoryRequest,
  MemoryDTO,
  MemoryType,
  SdkMemoryListDTO,
  SdkMemoryReadDTO,
  SdkMemoryScope,
  UpdateMemoryRequest,
  UpdateSdkMemoryFileRequest
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

export async function getServerUrl(path: string): Promise<string> {
  const origin = await getServerOrigin()
  if (!origin) throw new Error('server_not_ready')
  return `${origin}${path}`
}

function jsonHeaders(headers?: HeadersInit): Headers {
  const next = new Headers(headers)
  if (!next.has('Content-Type')) next.set('Content-Type', 'application/json')
  return next
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { headers, ...requestInit } = init
  const res = await fetch(await getServerUrl(path), {
    ...requestInit,
    headers: jsonHeaders(headers)
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

export type SdkMemoryFileParams = {
  scope: SdkMemoryScope
  agentName?: string
  relativePath: string
}

function sdkMemoryQuery(params: SdkMemoryFileParams): string {
  const query = new URLSearchParams()
  query.set('scope', params.scope)
  if (params.agentName) query.set('agentName', params.agentName)
  query.set('path', params.relativePath)
  return query.toString()
}

export async function listSdkMemory(): Promise<SdkMemoryListDTO> {
  return apiFetch<SdkMemoryListDTO>('/api/sdk-memory')
}

export async function readSdkMemoryFile(params: SdkMemoryFileParams): Promise<SdkMemoryReadDTO> {
  return apiFetch<SdkMemoryReadDTO>(`/api/sdk-memory/file?${sdkMemoryQuery(params)}`)
}

export async function updateSdkMemoryFile(
  params: SdkMemoryFileParams,
  body: UpdateSdkMemoryFileRequest
): Promise<SdkMemoryReadDTO> {
  return apiFetch<SdkMemoryReadDTO>(`/api/sdk-memory/file?${sdkMemoryQuery(params)}`, {
    method: 'PUT',
    body: JSON.stringify(body)
  })
}

export async function deleteSdkMemoryFile(params: SdkMemoryFileParams): Promise<void> {
  return apiFetch<void>(`/api/sdk-memory/file?${sdkMemoryQuery(params)}`, { method: 'DELETE' })
}

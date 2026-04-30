import type {
  CreateMemoryRequest,
  HealthDTO,
  MemoryDTO,
  MemoryType,
  SdkMemoryListDTO,
  SdkMemoryReadDTO,
  SdkMemoryScope,
  UpdateMemoryRequest,
  UpdateSdkMemoryFileRequest
} from '@shared/types'

const DEFAULT_SERVER_ORIGIN = 'http://127.0.0.1:3001'

export function getServerOriginSync(): string {
  const configured = import.meta.env.VITE_AGENT_SERVER_URL?.trim()
  return (configured || DEFAULT_SERVER_ORIGIN).replace(/\/+$/, '')
}

export async function getServerOrigin(): Promise<string | null> {
  return getServerOriginSync()
}

export function apiUrl(path: string): string {
  return `${getServerOriginSync()}${path}`
}

export function pathWithQuery(path: string, query: URLSearchParams): string {
  const suffix = query.toString()
  return `${path}${suffix ? `?${suffix}` : ''}`
}

export async function getServerHealth(signal?: AbortSignal): Promise<HealthDTO> {
  const res = await fetch(apiUrl('/health'), { signal })
  if (!res.ok) throw new Error(`health_failed_${res.status}`)
  return (await res.json()) as HealthDTO
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
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

  return apiFetch<MemoryDTO[]>(pathWithQuery('/api/memories', query))
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

function sdkMemoryPath(params: SdkMemoryFileParams): string {
  const query = new URLSearchParams()
  query.set('scope', params.scope)
  if (params.agentName) query.set('agentName', params.agentName)
  query.set('path', params.relativePath)
  return pathWithQuery('/api/sdk-memory/file', query)
}

export async function listSdkMemory(): Promise<SdkMemoryListDTO> {
  return apiFetch<SdkMemoryListDTO>('/api/sdk-memory')
}

export async function readSdkMemoryFile(params: SdkMemoryFileParams): Promise<SdkMemoryReadDTO> {
  return apiFetch<SdkMemoryReadDTO>(sdkMemoryPath(params))
}

export async function updateSdkMemoryFile(
  params: SdkMemoryFileParams,
  body: UpdateSdkMemoryFileRequest
): Promise<SdkMemoryReadDTO> {
  return apiFetch<SdkMemoryReadDTO>(sdkMemoryPath(params), {
    method: 'PUT',
    body: JSON.stringify(body)
  })
}

export async function deleteSdkMemoryFile(params: SdkMemoryFileParams): Promise<void> {
  return apiFetch<void>(sdkMemoryPath(params), { method: 'DELETE' })
}

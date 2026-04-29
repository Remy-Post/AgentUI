import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ToolDTO, UpdateToolRequest } from '@shared/types'
import { apiFetch } from '../lib/api'

const FALLBACK_TOOLS: ToolDTO[] = [
  { id: 'read_file', description: 'Read file contents from the workspace.', enabled: true },
  { id: 'edit_file', description: 'Apply targeted edits to existing files.', enabled: true },
  { id: 'grep', description: 'Search file contents for patterns.', enabled: true },
  { id: 'list_files', description: 'Enumerate files and directories.', enabled: true },
  { id: 'shell.exec', description: 'Run shell commands in the workspace.', enabled: false },
  { id: 'web.fetch', description: 'Fetch HTTP resources.', enabled: true },
  { id: 'web.search', description: 'Search the web for information.', enabled: true },
  { id: 'git.commit', description: 'Stage and commit changes via git.', enabled: false },
  {
    id: 'sqlite.query',
    description: 'Run SQL queries against local SQLite databases.',
    enabled: false
  },
  {
    id: 'google.workspace.drive',
    description: 'Allow scoped Google Drive access through AgentUI MCP subagents.',
    enabled: false
  },
  {
    id: 'google.workspace.gmail',
    description: 'Allow scoped Gmail access through AgentUI MCP subagents.',
    enabled: false
  },
  {
    id: 'google.workspace.calendar',
    description: 'Allow scoped Google Calendar access through AgentUI MCP subagents.',
    enabled: false
  },
  {
    id: 'google.workspace.sheets',
    description: 'Allow scoped Google Sheets access through AgentUI MCP subagents.',
    enabled: false
  },
  {
    id: 'google.workspace.docs',
    description: 'Allow scoped Google Docs access through AgentUI MCP subagents.',
    enabled: false
  },
  {
    id: 'google.workspace.tasks',
    description: 'Allow scoped Google Tasks access through AgentUI MCP subagents.',
    enabled: false
  }
]

function isMissingEndpoint(error: unknown): boolean {
  if (error instanceof Error) return error.message.startsWith('request_failed_404')
  return false
}

export function useTools(): {
  tools: ToolDTO[]
  isLoading: boolean
  isFallback: boolean
  setEnabled: (id: string, enabled: boolean) => void
} {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['tools'],
    queryFn: async (): Promise<{ tools: ToolDTO[]; fallback: boolean }> => {
      try {
        const data = await apiFetch<ToolDTO[]>('/api/tools')
        return { tools: data, fallback: false }
      } catch (error) {
        if (isMissingEndpoint(error)) {
          // TODO: remove fallback once /api/tools is stable in all environments
          console.warn('[useTools] /api/tools missing — using fallback list.')
          return { tools: FALLBACK_TOOLS, fallback: true }
        }
        throw error
      }
    },
    staleTime: 30_000
  })

  const mutation = useMutation({
    mutationFn: async ({
      id,
      body
    }: {
      id: string
      body: UpdateToolRequest
    }): Promise<ToolDTO | null> => {
      try {
        return await apiFetch<ToolDTO>(`/api/tools/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(body)
        })
      } catch (error) {
        if (isMissingEndpoint(error)) return null
        throw error
      }
    },
    onMutate: async ({ id, body }) => {
      await queryClient.cancelQueries({ queryKey: ['tools'] })
      const previous = queryClient.getQueryData<{ tools: ToolDTO[]; fallback: boolean }>(['tools'])
      if (previous) {
        queryClient.setQueryData(['tools'], {
          ...previous,
          tools: previous.tools.map((t) => (t.id === id ? ({ ...t, ...body } as ToolDTO) : t))
        })
      }
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['tools'], ctx.previous)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['tools'] })
    }
  })

  return {
    tools: query.data?.tools ?? [],
    isLoading: query.isLoading,
    isFallback: query.data?.fallback ?? false,
    setEnabled: (id, enabled) => mutation.mutate({ id, body: { enabled } })
  }
}

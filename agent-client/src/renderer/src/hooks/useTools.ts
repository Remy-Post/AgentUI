import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ToolDTO, UpdateToolRequest } from '@shared/types'
import { apiFetch } from '../lib/api'

function fallbackTool(
  id: string,
  label: string,
  category: string,
  enabled: boolean,
  order: number,
  options: Partial<ToolDTO> = {}
): ToolDTO {
  return {
    id,
    label,
    category,
    enabled,
    order,
    kind: options.kind ?? 'sdk',
    description: options.description ?? label,
    quickRank: options.quickRank,
    locked: options.locked,
    permission: options.permission
  }
}

const FALLBACK_TOOLS: ToolDTO[] = [
  fallbackTool('Agent', 'Agent', 'orchestration', true, 10, { locked: true }),
  fallbackTool('AskUserQuestion', 'Ask user question', 'orchestration', false, 20),
  fallbackTool('Read', 'Read files', 'computer', true, 100, { quickRank: 2 }),
  fallbackTool('Glob', 'Find files', 'computer', true, 110),
  fallbackTool('Grep', 'Search files', 'computer', true, 120),
  fallbackTool('Edit', 'Edit files', 'computer', true, 130),
  fallbackTool('MultiEdit', 'Multi-edit files', 'computer', true, 140),
  fallbackTool('Write', 'Write files', 'computer', true, 150),
  fallbackTool('Bash', 'Bash', 'computer', false, 160, { quickRank: 1 }),
  fallbackTool('PowerShell', 'PowerShell', 'computer', false, 170),
  fallbackTool('Monitor', 'Monitor', 'computer', false, 180),
  fallbackTool('LSP', 'LSP', 'computer', false, 190),
  fallbackTool('WebFetch', 'Web fetch', 'web', true, 300),
  fallbackTool('WebSearch', 'Web search', 'web', true, 310, { quickRank: 3 }),
  fallbackTool('EnterPlanMode', 'Enter plan mode', 'planning', false, 400),
  fallbackTool('ExitPlanMode', 'Exit plan mode', 'planning', false, 410),
  fallbackTool('EnterWorktree', 'Enter worktree', 'worktrees', false, 500),
  fallbackTool('ExitWorktree', 'Exit worktree', 'worktrees', false, 510),
  fallbackTool('NotebookEdit', 'Notebook edit', 'notebooks', false, 600),
  fallbackTool('CronCreate', 'Schedule task', 'schedules', false, 700),
  fallbackTool('CronList', 'List schedules', 'schedules', false, 710),
  fallbackTool('CronDelete', 'Delete schedule', 'schedules', false, 720),
  fallbackTool('TodoWrite', 'Todo write', 'tasks', true, 800),
  fallbackTool('TaskCreate', 'Create task', 'tasks', false, 810),
  fallbackTool('TaskGet', 'Get task', 'tasks', false, 820),
  fallbackTool('TaskList', 'List tasks', 'tasks', false, 830),
  fallbackTool('TaskUpdate', 'Update task', 'tasks', false, 840),
  fallbackTool('TaskOutput', 'Task output', 'tasks', false, 850),
  fallbackTool('TaskStop', 'Stop task', 'tasks', false, 860),
  fallbackTool('TeamCreate', 'Create team', 'tasks', false, 870),
  fallbackTool('SendMessage', 'Send teammate message', 'tasks', false, 880),
  fallbackTool('TeamDelete', 'Delete team', 'tasks', false, 890),
  fallbackTool('ListMcpResourcesTool', 'List MCP resources', 'mcp', false, 900),
  fallbackTool('ReadMcpResourceTool', 'Read MCP resource', 'mcp', false, 910),
  fallbackTool('ToolSearch', 'Tool search', 'mcp', false, 920),
  fallbackTool('Skill', 'Skill', 'mcp', true, 930),
  fallbackTool('google.workspace.drive', 'Google Drive', 'google-suite', false, 1000, { kind: 'mcp' }),
  fallbackTool('google.workspace.gmail', 'Gmail', 'google-suite', false, 1010, { kind: 'mcp' }),
  fallbackTool('google.workspace.calendar', 'Google Calendar', 'google-suite', false, 1020, { kind: 'mcp' }),
  fallbackTool('google.workspace.sheets', 'Google Sheets', 'google-suite', false, 1030, { kind: 'mcp' }),
  fallbackTool('google.workspace.docs', 'Google Docs', 'google-suite', false, 1040, { kind: 'mcp' }),
  fallbackTool('google.workspace.tasks', 'Google Tasks', 'google-suite', false, 1050, { kind: 'mcp' }),
  fallbackTool('mongodb.read', 'MongoDB read', 'database', false, 1100, { kind: 'mcp' }),
  fallbackTool('mongodb.create', 'MongoDB create', 'database', false, 1110, { kind: 'mcp' }),
  fallbackTool('mongodb.update', 'MongoDB update', 'database', false, 1120, { kind: 'mcp' }),
  fallbackTool('mongodb.delete', 'MongoDB delete', 'database', false, 1130, { kind: 'mcp' }),
  fallbackTool('mysql.read', 'MySQL read', 'database', false, 1140, { kind: 'mcp' }),
  fallbackTool('mysql.create', 'MySQL create', 'database', false, 1150, { kind: 'mcp' }),
  fallbackTool('mysql.update', 'MySQL update', 'database', false, 1160, { kind: 'mcp' }),
  fallbackTool('mysql.delete', 'MySQL delete', 'database', false, 1170, { kind: 'mcp' }),
  fallbackTool('git.commit', 'Git commit', 'source-control', false, 1200, { kind: 'compatibility' }),
  fallbackTool('sqlite.query', 'SQLite query', 'database', false, 1210, { kind: 'compatibility' })
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
          console.warn('[useTools] /api/tools missing - using fallback list.')
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

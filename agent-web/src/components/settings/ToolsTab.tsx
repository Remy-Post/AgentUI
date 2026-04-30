import { useMemo, useState } from 'react'
import {
  CalendarClock,
  ChevronDown,
  Cloud,
  Database,
  GitBranch,
  Globe,
  Monitor,
  Network,
  NotebookPen,
  Route,
  ShieldCheck,
  StickyNote,
  SquareKanban,
  Wrench,
  type LucideIcon
} from 'lucide-react'
import type { ToolDTO } from '@shared/types'
import { useTools } from '../../hooks/useTools'
import { useKeybindAction } from '../../hooks/useKeybindAction'

type ToolCategory = {
  id: string
  label: string
  description: string
  icon: LucideIcon
  defaultOpen: boolean
  order: number
}

type ToolGroup = ToolCategory & {
  tools: ToolDTO[]
  allowedCount: number
}

const CATEGORY_DEFS: ToolCategory[] = [
  {
    id: 'orchestration',
    label: 'Orchestration',
    description: 'Subagents, clarification, and orchestration controls.',
    icon: Route,
    defaultOpen: false,
    order: 10
  },
  {
    id: 'computer',
    label: 'Computer',
    description: 'Workspace files, code search, edits, shell, and local code intelligence.',
    icon: Monitor,
    defaultOpen: false,
    order: 20
  },
  {
    id: 'web',
    label: 'Web',
    description: 'Remote search and HTTP fetch tools.',
    icon: Globe,
    defaultOpen: false,
    order: 30
  },
  {
    id: 'database',
    label: 'Database',
    description: 'Local MongoDB, MySQL, and structured data tools.',
    icon: Database,
    defaultOpen: false,
    order: 40
  },
  {
    id: 'google-suite',
    label: 'Google Suite',
    description: 'Drive, Gmail, Calendar, Sheets, Docs, and Tasks connectors.',
    icon: Cloud,
    defaultOpen: false,
    order: 50
  },
  {
    id: 'notes',
    label: 'Notes',
    description: 'Agent access to user-visible AgentUI Notes.',
    icon: StickyNote,
    defaultOpen: false,
    order: 55
  },
  {
    id: 'planning',
    label: 'Planning',
    description: 'Plan-mode controls exposed by Claude Code.',
    icon: ShieldCheck,
    defaultOpen: false,
    order: 60
  },
  {
    id: 'worktrees',
    label: 'Worktrees',
    description: 'Isolated git worktree session controls.',
    icon: GitBranch,
    defaultOpen: false,
    order: 70
  },
  {
    id: 'notebooks',
    label: 'Notebooks',
    description: 'Jupyter notebook editing tools.',
    icon: NotebookPen,
    defaultOpen: false,
    order: 80
  },
  {
    id: 'schedules',
    label: 'Schedules',
    description: 'Session-scoped scheduled prompt controls.',
    icon: CalendarClock,
    defaultOpen: false,
    order: 90
  },
  {
    id: 'tasks',
    label: 'Tasks',
    description: 'Task checklist, background task, and agent-team controls.',
    icon: SquareKanban,
    defaultOpen: false,
    order: 100
  },
  {
    id: 'mcp',
    label: 'MCP and Skills',
    description: 'MCP resources, deferred tool search, and enabled skills.',
    icon: Network,
    defaultOpen: false,
    order: 110
  },
  {
    id: 'source-control',
    label: 'Source Control',
    description: 'Git workflow compatibility toggles.',
    icon: GitBranch,
    defaultOpen: false,
    order: 120
  },
  {
    id: 'other',
    label: 'Other',
    description: 'Additional tools returned by the backend registry.',
    icon: Wrench,
    defaultOpen: false,
    order: 999
  }
]

const CATEGORY_BY_ID = new Map(CATEGORY_DEFS.map((category) => [category.id, category]))

function categoryForTool(tool: ToolDTO): ToolCategory {
  if (tool.category && CATEGORY_BY_ID.has(tool.category)) return CATEGORY_BY_ID.get(tool.category)!
  return CATEGORY_BY_ID.get('other')!
}

function sortTools(a: ToolDTO, b: ToolDTO): number {
  const aOrder = a.order ?? Number.MAX_SAFE_INTEGER
  const bOrder = b.order ?? Number.MAX_SAFE_INTEGER
  if (aOrder !== bOrder) return aOrder - bOrder
  return a.id.localeCompare(b.id)
}

function buildToolGroups(tools: ToolDTO[]): ToolGroup[] {
  const buckets = new Map<string, ToolDTO[]>()

  tools.forEach((tool) => {
    const category = categoryForTool(tool)
    const bucket = buckets.get(category.id) ?? []
    bucket.push(tool)
    buckets.set(category.id, bucket)
  })

  return CATEGORY_DEFS.map((category) => {
    const groupedTools = (buckets.get(category.id) ?? []).slice().sort(sortTools)
    return {
      ...category,
      tools: groupedTools,
      allowedCount: groupedTools.filter((tool) => tool.enabled).length
    }
  }).filter((group) => group.tools.length > 0)
}

function formatSummary(allowedCount: number, total: number): string {
  if (total === 0) return '-'
  if (allowedCount === total) return 'All allowed'
  if (allowedCount === 0) return 'All denied'
  return `${allowedCount} of ${total} allowed`
}

function formatGroupSummary(allowedCount: number, total: number): string {
  if (total === 0) return '0 tools'
  return `${allowedCount}/${total} allowed`
}

function formatToolCount(total: number): string {
  return total === 1 ? '1 tool' : `${total} tools`
}

function toolTitle(tool: ToolDTO): string {
  return tool.locked ? 'Required' : tool.enabled ? 'Allowed' : 'Denied'
}

export default function ToolsTab(): React.JSX.Element {
  const { tools, isLoading, isFallback, setEnabled } = useTools()
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(CATEGORY_DEFS.map((category) => [category.id, category.defaultOpen]))
  )

  const groups = useMemo(() => buildToolGroups(tools), [tools])
  const quickTools = useMemo(
    () =>
      tools
        .filter((tool) => typeof tool.quickRank === 'number')
        .slice()
        .sort((a, b) => (a.quickRank ?? 999) - (b.quickRank ?? 999)),
    [tools]
  )
  const allowedCount = tools.filter((t) => t.enabled).length
  const total = tools.length
  const summary = formatSummary(allowedCount, total)

  const setToolEnabled = (tool: ToolDTO, enabled: boolean): void => {
    if (tool.locked) return
    setEnabled(tool.id, enabled)
  }

  const allowAll = (): void => {
    tools.forEach((t) => {
      if (!t.locked && !t.enabled) setEnabled(t.id, true)
    })
  }
  const denyAll = (): void => {
    tools.forEach((t) => {
      if (!t.locked && t.enabled) setEnabled(t.id, false)
    })
  }

  useKeybindAction(['settings.allowAllTools', 'settings.denyAllTools'], (actionId) => {
    if (actionId === 'settings.allowAllTools') {
      allowAll()
      return true
    }
    if (actionId === 'settings.denyAllTools') {
      denyAll()
      return true
    }
    return false
  })

  const renderToolRow = (tool: ToolDTO, compact = false): React.JSX.Element => (
    <div key={tool.id} className={`list-row compact tool-row ${compact ? 'quick-tool-row' : ''}`}>
      <div className="glyph">
        <Wrench size={12} />
      </div>
      <div>
        <div className="name">{tool.label ?? tool.id}</div>
        <div className="desc">
          <span className="mono">{tool.id}</span>
          {tool.description ? ` - ${tool.description}` : ''}
        </div>
        {tool.permission && <div className="desc">{tool.permission}</div>}
      </div>
      <span className={`tool-state ${tool.enabled ? 'allowed' : 'denied'}`}>
        {toolTitle(tool)}
      </span>
      <label className={`toggle ${tool.locked ? 'disabled' : ''}`} title={toolTitle(tool)}>
        <input
          type="checkbox"
          checked={tool.enabled}
          disabled={tool.locked}
          aria-label={`${toolTitle(tool)}: ${tool.label ?? tool.id}`}
          onChange={(e) => setToolEnabled(tool, e.target.checked)}
        />
        <span className="slider" />
      </label>
    </div>
  )

  return (
    <div className="settings-pane">
      <div className="pane-head">
        <div className="pane-head-text">
          <div className="pane-title">Tool registry</div>
          <div className="pane-sub">
            Toggle Claude Code tools, MCP connectors, and scoped service access for subagents.{' '}
            {summary}.{' '}
            {isFallback && (
              <span className="chrome">(local fallback)</span>
            )}
          </div>
        </div>
        <div className="row-actions">
          <button type="button" className="btn-secondary" onClick={allowAll} aria-label="Allow all unlocked tools">
            Allow all
          </button>
          <button type="button" className="btn-secondary" onClick={denyAll} aria-label="Deny all unlocked tools">
            Deny all
          </button>
        </div>
      </div>

      {quickTools.length > 0 && (
        <div className="quick-tools">
          <div className="quick-tools-head">
            <div>
              <div className="cap">Quick access</div>
              <div className="pane-sub">Pinned controls for common turns.</div>
            </div>
          </div>
          <div className="quick-tools-grid">
            {quickTools.map((tool) => renderToolRow(tool, true))}
          </div>
        </div>
      )}

      {groups.length > 0 ? (
        <div className="tool-groups">
          {groups.map((group) => {
            const Icon = group.icon
            return (
              <details
                key={group.id}
                className="tool-group"
                open={openGroups[group.id]}
                onToggle={(event) => {
                  const isOpen = event.currentTarget.open
                  setOpenGroups((current) => ({ ...current, [group.id]: isOpen }))
                }}
              >
                <summary className="tool-group-summary">
                  <span className="tool-group-icon">
                    <Icon size={14} />
                  </span>
                  <span className="tool-group-copy">
                    <span className="tool-group-title-row">
                      <span className="tool-group-title">{group.label}</span>
                      <span className="chrome">{formatToolCount(group.tools.length)}</span>
                    </span>
                    <span className="tool-group-desc">{group.description}</span>
                  </span>
                  <span className="tool-group-count mono">
                    {formatGroupSummary(group.allowedCount, group.tools.length)}
                  </span>
                  <ChevronDown className="tool-group-chevron" size={14} />
                </summary>
                <div className="tool-rows">{group.tools.map((tool) => renderToolRow(tool))}</div>
              </details>
            )
          })}
        </div>
      ) : (
        <div className="list-card">
          <div className="list-row">
            <div />
            <div>
              <div className="desc">{isLoading ? 'Loading tools...' : 'No tools registered.'}</div>
            </div>
            <div />
          </div>
        </div>
      )}
    </div>
  )
}

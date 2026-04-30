import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Pencil, Bot } from 'lucide-react'
import EditEntityModal from './EditEntityModal'
import { apiFetch } from '../../lib/api'
import type { SubagentDTO } from '@shared/types'

export default function SubagentsTab(): React.JSX.Element {
  const queryClient = useQueryClient()
  const list = useQuery({
    queryKey: ['subagents'],
    queryFn: () => apiFetch<SubagentDTO[]>('/api/subagents')
  })
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/subagents/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['subagents'] })
  })

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<SubagentDTO | null>(null)

  const openCreate = (): void => {
    setEditing(null)
    setModalOpen(true)
  }
  const openEdit = (subagent: SubagentDTO): void => {
    setEditing(subagent)
    setModalOpen(true)
  }

  return (
    <div className="settings-pane">
      <div className="pane-head">
        <div className="pane-head-text">
          <div className="pane-title">Subagents</div>
          <div className="pane-sub">
            Materialized to <span className="mono">.claude/agents/</span> when enabled. Available to
            the SDK session.
          </div>
        </div>
        <button type="button" className="btn-primary" onClick={openCreate}>
          <Plus size={12} /> New subagent
        </button>
      </div>

      <div className="list-card">
        {(list.data ?? []).map((s) => (
          <div key={s._id} className="list-row">
            <div className="glyph">
              <Bot size={14} />
            </div>
            <div>
              <div className="name">{s.name}</div>
              <div className="desc">{s.description}</div>
              <div className="memory-meta">
                <span className="chip memory-tag">memory: {s.memory ?? 'none'}</span>
              </div>
            </div>
            <div className="row-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => openEdit(s)}
                title="Edit"
                style={{ padding: '6px 10px' }}
              >
                <Pencil size={12} />
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={() => {
                  if (confirm(`Delete subagent "${s.name}"?`)) remove.mutate(s._id)
                }}
                title="Delete"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}
        {list.data && list.data.length === 0 && (
          <div className="list-row">
            <div />
            <div>
              <div className="desc">No subagents yet. Add one to make it available to the SDK.</div>
            </div>
            <div />
          </div>
        )}
      </div>

      <EditEntityModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        kind="subagent"
        existing={editing}
      />
    </div>
  )
}

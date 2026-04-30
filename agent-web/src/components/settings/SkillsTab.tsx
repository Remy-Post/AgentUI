import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Pencil, FileText } from 'lucide-react'
import EditEntityModal from './EditEntityModal'
import { apiFetch } from '../../lib/api'
import { useKeybindAction } from '../../hooks/useKeybindAction'
import type { SkillDTO } from '@shared/types'

export default function SkillsTab(): React.JSX.Element {
  const queryClient = useQueryClient()
  const list = useQuery({
    queryKey: ['skills'],
    queryFn: () => apiFetch<SkillDTO[]>('/api/skills')
  })
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/skills/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['skills'] })
  })

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<SkillDTO | null>(null)

  const openCreate = (): void => {
    setEditing(null)
    setModalOpen(true)
  }
  const openEdit = (skill: SkillDTO): void => {
    setEditing(skill)
    setModalOpen(true)
  }

  useKeybindAction('settings.newSkill', () => {
    openCreate()
    return true
  })

  return (
    <div className="settings-pane">
      <div className="pane-head">
        <div className="pane-head-text">
          <div className="pane-title">Skills</div>
          <div className="pane-sub">
            Materialized to <span className="mono">.claude/skills/&lt;name&gt;/SKILL.md</span> when
            enabled.
          </div>
        </div>
        <button type="button" className="btn-primary" onClick={openCreate}>
          <Plus size={12} /> New skill
        </button>
      </div>

      <div className="list-card">
        {(list.data ?? []).map((s) => (
          <div key={s._id} className="list-row">
            <div className="glyph">
              <FileText size={14} />
            </div>
            <div>
              <div className="name">{s.name}</div>
              <div className="desc">{s.description}</div>
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
                  if (confirm(`Delete skill "${s.name}"?`)) remove.mutate(s._id)
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
              <div className="desc">No skills yet.</div>
            </div>
            <div />
          </div>
        )}
      </div>

      <EditEntityModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        kind="skill"
        existing={editing}
      />
    </div>
  )
}

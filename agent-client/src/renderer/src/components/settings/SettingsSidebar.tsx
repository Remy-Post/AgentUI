import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import Sidebar from '../Sidebar'
import EditEntityModal from './EditEntityModal'
import { apiFetch } from '../../lib/api'
import { truncate } from '../../lib/format'
import { useViewStore } from '../../store/view'
import type { SkillDTO, SubagentDTO } from '@shared/types'

type EntityKind = 'skill' | 'subagent'

function EntityList({ kind }: { kind: EntityKind }): React.JSX.Element {
  const queryKey = kind === 'skill' ? 'skills' : 'subagents'
  const path = kind === 'skill' ? '/api/skills' : '/api/subagents'
  const queryClient = useQueryClient()

  const list = useQuery({
    queryKey: [queryKey],
    queryFn: () => apiFetch<Array<SkillDTO | SubagentDTO>>(path),
  })

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`${path}/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [queryKey] }),
  })

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<SkillDTO | SubagentDTO | null>(null)
  const label = kind === 'skill' ? 'Skills' : 'Subagents'
  const newLabel = kind === 'skill' ? 'New skill' : 'New subagent'

  const openCreate = (): void => {
    setEditing(null)
    setModalOpen(true)
  }
  const openEdit = (entity: SkillDTO | SubagentDTO): void => {
    setEditing(entity)
    setModalOpen(true)
  }

  return (
    <>
      <button type="button" className="new-conv" onClick={openCreate}>
        <span className="left">
          <Plus size={14} />
          <span>{newLabel}</span>
        </span>
        <span className="chrome">⌘N</span>
      </button>
      <div className="recent-cap">
        <span className="cap">
          {label} {list.data ? `· ${list.data.length}` : ''}
        </span>
      </div>
      <ul className="conv-list">
        {(list.data ?? []).map((entity) => {
          const subtitle =
            kind === 'subagent'
              ? (entity as SubagentDTO).model ?? '—'
              : truncate(entity.description ?? '', 38)
          return (
            <li key={entity._id} className="conv-item" onClick={() => openEdit(entity)}>
              <div className="dot" />
              <div style={{ minWidth: 0 }}>
                <div className="conv-row">
                  <div className="conv-title">{entity.name}</div>
                </div>
                <div className="conv-meta">
                  <span className="chrome">{subtitle}</span>
                </div>
              </div>
              <button
                type="button"
                className="delete-btn"
                title="Delete"
                onClick={(e) => {
                  e.stopPropagation()
                  if (confirm(`Delete ${kind} "${entity.name}"?`)) remove.mutate(entity._id)
                }}
              >
                <Trash2 size={12} />
              </button>
            </li>
          )
        })}
        {list.data && list.data.length === 0 && (
          <li style={{ padding: '12px 16px' }}>
            <span className="chrome">none yet</span>
          </li>
        )}
      </ul>

      <EditEntityModal open={modalOpen} onClose={() => setModalOpen(false)} kind={kind} existing={editing} />
    </>
  )
}

type Props = {
  selectedConversationId: string | null
  onSelectConversation: (id: string) => void
}

export default function SettingsSidebar({
  selectedConversationId,
  onSelectConversation,
}: Props): React.JSX.Element {
  const settingsTab = useViewStore((s) => s.settingsTab)

  if (settingsTab === 'skills') {
    return <Sidebar mode="settings-skills" footLabel="settings" bodySlot={<EntityList kind="skill" />} />
  }
  if (settingsTab === 'subagents') {
    return (
      <Sidebar mode="settings-subagents" footLabel="settings" bodySlot={<EntityList kind="subagent" />} />
    )
  }
  return (
    <Sidebar
      mode="settings-default"
      selectedId={selectedConversationId}
      onSelect={onSelectConversation}
    />
  )
}

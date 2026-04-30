import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Brain, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import Modal from '../Modal'
import { createMemory, deleteMemory, listMemories, updateMemory } from '../../lib/api'
import { formatRelativeTime } from '../../lib/format'
import type { CreateMemoryRequest, MemoryDTO, MemoryType } from '@shared/types'

const MEMORY_TYPE_OPTIONS: Array<{ value: MemoryType; label: string }> = [
  { value: 'preference', label: 'Preference' },
  { value: 'fact', label: 'Fact' },
  { value: 'project', label: 'Project' },
  { value: 'instruction', label: 'Instruction' },
  { value: 'note', label: 'Note' }
]

type TypeFilter = MemoryType | ''

type Draft = {
  title: string
  content: string
  type: MemoryType
  tagsText: string
}

function emptyDraft(): Draft {
  return {
    title: '',
    content: '',
    type: 'note',
    tagsText: ''
  }
}

function draftFromMemory(memory: MemoryDTO | null): Draft {
  if (!memory) return emptyDraft()
  return {
    title: memory.title,
    content: memory.content,
    type: memory.type,
    tagsText: memory.tags.join(', ')
  }
}

function tagsFromInput(input: string): string[] {
  return input
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
}

function typeLabel(type: MemoryType): string {
  return MEMORY_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? 'Note'
}

function MemoryEditorModal({
  open,
  existing,
  saving,
  error,
  onClose,
  onSave
}: {
  open: boolean
  existing: MemoryDTO | null
  saving: boolean
  error: unknown
  onClose: () => void
  onSave: (body: CreateMemoryRequest) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState<Draft>(() => draftFromMemory(existing))

  useEffect(() => {
    if (open) setDraft(draftFromMemory(existing))
  }, [open, existing])

  const isValid = draft.title.trim().length > 0 && draft.content.trim().length > 0
  const title = existing ? 'Edit memory' : 'New memory'

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!isValid || saving}
            onClick={() =>
              onSave({
                title: draft.title,
                content: draft.content,
                type: draft.type,
                tags: tagsFromInput(draft.tagsText)
              })
            }
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </>
      }
    >
      <div className="field">
        <label className="field-label">Title</label>
        <input
          className="input"
          value={draft.title}
          onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
          placeholder="Short label"
        />
      </div>
      <div className="field">
        <label className="field-label">Type</label>
        <select
          className="select"
          value={draft.type}
          onChange={(event) =>
            setDraft((current) => ({ ...current, type: event.target.value as MemoryType }))
          }
        >
          {MEMORY_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="field-label">Tags</label>
        <input
          className="input"
          value={draft.tagsText}
          onChange={(event) =>
            setDraft((current) => ({ ...current, tagsText: event.target.value }))
          }
          placeholder="work, writing, agentui"
        />
      </div>
      <div className="field">
        <label className="field-label">Content</label>
        <textarea
          className="textarea memory-editor-content"
          value={draft.content}
          onChange={(event) =>
            setDraft((current) => ({ ...current, content: event.target.value }))
          }
          placeholder="Write the memory"
        />
      </div>
      {error ? (
        <div style={{ color: 'var(--color-error)', fontSize: 12 }}>
          Save failed. {error instanceof Error ? error.message : 'unknown error'}
        </div>
      ) : null}
    </Modal>
  )
}

export default function MemoryView(): React.JSX.Element {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('')
  const [tagFilter, setTagFilter] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<MemoryDTO | null>(null)

  const filters = useMemo(
    () => ({ search, type: typeFilter, tag: tagFilter }),
    [search, typeFilter, tagFilter]
  )

  const memoriesQuery = useQuery({
    queryKey: ['memories', filters],
    queryFn: () => listMemories(filters)
  })

  const save = useMutation({
    mutationFn: ({ id, body }: { id?: string; body: CreateMemoryRequest }) =>
      id ? updateMemory(id, body) : createMemory(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['memories'] })
      setModalOpen(false)
      setEditing(null)
    }
  })

  const remove = useMutation({
    mutationFn: (id: string) => deleteMemory(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['memories'] })
  })

  const openCreate = (): void => {
    save.reset()
    setEditing(null)
    setModalOpen(true)
  }

  const openEdit = (memory: MemoryDTO): void => {
    save.reset()
    setEditing(memory)
    setModalOpen(true)
  }

  const activeFilters = search.trim().length > 0 || Boolean(typeFilter) || tagFilter.trim().length > 0
  const memories = memoriesQuery.data ?? []

  return (
    <section className="settings-section">
      <header className="settings-header">
        <div>
          <h2 className="settings-title">Memory</h2>
          <div className="chrome">
            {memoriesQuery.data ? `${memories.length} shown` : 'local mongodb'}
          </div>
        </div>
      </header>
      <div className="settings-body memory-body">
        <div className="settings-pane memory-pane">
          <div className="pane-head">
            <div className="pane-head-text">
              <div className="pane-title">All memories</div>
              <div className="pane-sub">
                {activeFilters ? 'Filtered local memory.' : 'Local editable memory.'}
              </div>
            </div>
            <button type="button" className="btn-primary" onClick={openCreate}>
              <Plus size={12} /> New memory
            </button>
          </div>

          <div className="memory-controls">
            <label className="memory-search">
              <Search size={14} />
              <input
                className="input"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search memories"
              />
            </label>
            <select
              className="select"
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as TypeFilter)}
              aria-label="Filter by type"
            >
              <option value="">All types</option>
              {MEMORY_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <input
              className="input"
              value={tagFilter}
              onChange={(event) => setTagFilter(event.target.value)}
              placeholder="Tag"
              aria-label="Filter by tag"
            />
            <button
              type="button"
              className="btn-secondary"
              disabled={!activeFilters}
              onClick={() => {
                setSearch('')
                setTypeFilter('')
                setTagFilter('')
              }}
            >
              Clear
            </button>
          </div>

          <div className="list-card memory-list">
            {memoriesQuery.isPending && (
              <div className="list-row compact">
                <div />
                <div className="desc">Loading memories...</div>
                <div />
              </div>
            )}

            {memoriesQuery.isError && (
              <div className="list-row compact">
                <div />
                <div className="desc" style={{ color: 'var(--color-error)' }}>
                  Failed to load memories.
                </div>
                <div />
              </div>
            )}

            {!memoriesQuery.isPending && !memoriesQuery.isError && memories.length === 0 && (
              <div className="list-row compact">
                <div />
                <div className="desc">
                  {activeFilters ? 'No memories match these filters.' : 'No memories yet.'}
                </div>
                <div />
              </div>
            )}

            {memories.map((memory) => (
              <div key={memory._id} className="list-row memory-row">
                <div className="glyph">
                  <Brain size={14} />
                </div>
                <div className="memory-main">
                  <div className="memory-title-row">
                    <div className="name memory-title">{memory.title}</div>
                    <span className="chip memory-type">{typeLabel(memory.type)}</span>
                  </div>
                  <div className="desc memory-content">{memory.content}</div>
                  <div className="memory-meta">
                    <span className="chrome">updated {formatRelativeTime(memory.updatedAt)}</span>
                    {memory.usageCount > 0 && (
                      <span className="chrome">used {memory.usageCount}</span>
                    )}
                    {memory.tags.map((tag) => (
                      <span key={tag} className="chip memory-tag">
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="row-actions memory-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => openEdit(memory)}
                    title="Edit memory"
                    style={{ padding: '6px 10px' }}
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    type="button"
                    className="btn-danger"
                    disabled={remove.isPending}
                    onClick={() => {
                      if (confirm(`Delete memory "${memory.title}"?`)) remove.mutate(memory._id)
                    }}
                    title="Delete memory"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <MemoryEditorModal
        open={modalOpen}
        existing={editing}
        saving={save.isPending}
        error={save.isError ? save.error : null}
        onClose={() => setModalOpen(false)}
        onSave={(body) => save.mutate({ id: editing?._id, body })}
      />
    </section>
  )
}

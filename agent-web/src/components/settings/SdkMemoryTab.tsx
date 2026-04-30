import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BrainCircuit, FileText, Moon, Plus, Save, Trash2, type LucideIcon } from 'lucide-react'
import Modal from '../Modal'
import {
  deleteSdkMemoryFile,
  listSdkMemory,
  readSdkMemoryFile,
  updateSdkMemoryFile,
  type SdkMemoryFileParams
} from '../../lib/api'
import { formatRelativeTime } from '../../lib/format'
import { useKeybindAction } from '../../hooks/useKeybindAction'
import { useSettings } from '../../hooks/useSettings'
import type { SdkMemoryFileDTO, SdkMemoryReadDTO, SdkMemoryRootDTO, SdkMemoryScope } from '@shared/types'

function fileKey(file: SdkMemoryFileDTO): string {
  return [file.scope, file.agentName ?? '', file.relativePath].join('|')
}

function fileParams(file: SdkMemoryFileDTO): SdkMemoryFileParams {
  return {
    scope: file.scope,
    agentName: file.agentName,
    relativePath: file.relativePath
  }
}

function fileNameFromPath(relativePath: string): string {
  return relativePath.split('/').filter(Boolean).at(-1) ?? relativePath
}

function fileFromRead(file: SdkMemoryReadDTO): SdkMemoryFileDTO {
  return {
    scope: file.scope,
    agentName: file.agentName,
    relativePath: file.relativePath,
    name: fileNameFromPath(file.relativePath),
    size: new TextEncoder().encode(file.content).length,
    updatedAt: file.updatedAt
  }
}

function rootFileCount(root: SdkMemoryRootDTO): number {
  return root.files.length + root.agents.reduce((total, agent) => total + agent.files.length, 0)
}

function isAgentScopedScope(scope: SdkMemoryScope): boolean {
  return scope === 'user' || scope === 'project' || scope === 'local'
}

type NewFileDraft = {
  scope: SdkMemoryScope
  agentName: string
  relativePath: string
  content: string
}

function emptyNewFileDraft(scope: SdkMemoryScope): NewFileDraft {
  return {
    scope,
    agentName: '',
    relativePath: 'memory.md',
    content: ''
  }
}

function ToggleRow({
  icon: Icon,
  name,
  description,
  checked,
  onChange
}: {
  icon: LucideIcon
  name: string
  description: string
  checked: boolean
  onChange: (next: boolean) => void
}): React.JSX.Element {
  return (
    <div className="list-row">
      <div className="glyph">
        <Icon size={14} />
      </div>
      <div>
        <div className="name">{name}</div>
        <div className="desc">{description}</div>
      </div>
      <label className="toggle" title={checked ? 'On' : 'Off'}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="slider" />
      </label>
    </div>
  )
}

export default function SdkMemoryTab(): React.JSX.Element {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<SdkMemoryFileDTO | null>(null)
  const [content, setContent] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [newFile, setNewFile] = useState<NewFileDraft>(() => emptyNewFileDraft('local'))
  const { data: settings, update, updateAsync } = useSettings()
  const autoMemoryEnabled = settings?.autoMemoryEnabled ?? true
  const autoDreamEnabled = settings?.autoDreamEnabled ?? false
  const autoMemoryDirectory = settings?.autoMemoryDirectory ?? ''

  const list = useQuery({
    queryKey: ['sdk-memory'],
    queryFn: listSdkMemory
  })

  const availableRoots = useMemo(() => {
    const roots = list.data?.roots ?? []
    return roots.length > 0 ? roots : [{ scope: 'local' as const, label: 'Local agent memory' }]
  }, [list.data])

  const defaultNewFileScope = useMemo<SdkMemoryScope>(() => {
    return availableRoots.find((root) => root.scope === 'local')?.scope ?? availableRoots[0].scope
  }, [availableRoots])

  const files = useMemo(() => {
    const all: SdkMemoryFileDTO[] = []
    for (const root of list.data?.roots ?? []) {
      all.push(...root.files)
      for (const agent of root.agents) all.push(...agent.files)
    }
    return all
  }, [list.data])

  useEffect(() => {
    if (!selected && files.length > 0) setSelected(files[0])
    if (selected && !files.some((file) => fileKey(file) === fileKey(selected))) setSelected(null)
  }, [files, selected])

  const selectedParams = selected ? fileParams(selected) : null
  const fileQuery = useQuery({
    queryKey: ['sdk-memory-file', selected ? fileKey(selected) : 'none'],
    queryFn: () => readSdkMemoryFile(selectedParams as SdkMemoryFileParams),
    enabled: Boolean(selectedParams)
  })

  useEffect(() => {
    if (fileQuery.data) setContent(fileQuery.data.content)
  }, [fileQuery.data])

  const save = useMutation({
    mutationFn: () => {
      if (!selectedParams) throw new Error('no_file_selected')
      return updateSdkMemoryFile(selectedParams, { content })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sdk-memory'] })
      void queryClient.invalidateQueries({ queryKey: ['sdk-memory-file'] })
    }
  })

  const remove = useMutation({
    mutationFn: () => {
      if (!selectedParams) throw new Error('no_file_selected')
      return deleteSdkMemoryFile(selectedParams)
    },
    onSuccess: () => {
      setSelected(null)
      setContent('')
      void queryClient.invalidateQueries({ queryKey: ['sdk-memory'] })
    }
  })

  const create = useMutation({
    mutationFn: () => {
      const scope = newFile.scope
      const params: SdkMemoryFileParams = {
        scope,
        relativePath: newFile.relativePath.trim()
      }
      if (isAgentScopedScope(scope)) params.agentName = newFile.agentName.trim()
      return updateSdkMemoryFile(params, { content: newFile.content })
    },
    onSuccess: async (created) => {
      const createdFile = fileFromRead(created)
      await queryClient.invalidateQueries({ queryKey: ['sdk-memory'] })
      queryClient.setQueryData(['sdk-memory-file', fileKey(createdFile)], created)
      setSelected(createdFile)
      setContent(created.content)
      setCreateOpen(false)
    }
  })

  const openCreate = (): void => {
    create.reset()
    setNewFile(emptyNewFileDraft(defaultNewFileScope))
    setCreateOpen(true)
  }

  const closeCreate = (): void => {
    if (create.isPending) return
    setCreateOpen(false)
    create.reset()
  }

  const updateAutoMemoryDirectory = (value: string): void => {
    void updateAsync({ autoMemoryDirectory: value }).finally(() => {
      void queryClient.invalidateQueries({ queryKey: ['sdk-memory'] })
    })
  }

  const dirty = Boolean(fileQuery.data && content !== fileQuery.data.content)
  const createNeedsAgent = isAgentScopedScope(newFile.scope)
  const createValid =
    newFile.relativePath.trim().length > 0 && (!createNeedsAgent || newFile.agentName.trim().length > 0)

  useKeybindAction(
    [
      'settings.newSdkMemoryFile',
      'settings.saveSdkMemoryFile',
      'settings.deleteSdkMemoryFile',
      'settings.toggleAutoMemory',
      'settings.toggleAutoDream'
    ],
    (actionId) => {
      if (actionId === 'settings.newSdkMemoryFile') {
        openCreate()
        return true
      }
      if (actionId === 'settings.saveSdkMemoryFile') {
        if (!selected || !dirty || save.isPending) return false
        save.mutate()
        return true
      }
      if (actionId === 'settings.deleteSdkMemoryFile') {
        if (!selected || remove.isPending) return false
        if (confirm(`Delete SDK memory file "${selected.relativePath}"?`)) remove.mutate()
        return true
      }
      if (actionId === 'settings.toggleAutoMemory') {
        update({ autoMemoryEnabled: !autoMemoryEnabled })
        return true
      }
      if (actionId === 'settings.toggleAutoDream') {
        update({ autoDreamEnabled: !autoDreamEnabled })
        return true
      }
      return false
    }
  )

  return (
    <div className="settings-pane" style={{ maxWidth: 1180 }}>
      <div className="pane-head">
        <div className="pane-head-text">
          <div className="pane-title">SDK Memory</div>
          <div className="pane-sub">Claude Code native memory files by scope and subagent.</div>
        </div>
        <button type="button" className="btn-primary" onClick={openCreate}>
          <Plus size={12} /> New file
        </button>
      </div>

      <div className="list-card" style={{ marginBottom: 16 }}>
        <ToggleRow
          icon={BrainCircuit}
          name="Auto-memory"
          description="Allows Claude Code to read and write its native project memory."
          checked={autoMemoryEnabled}
          onChange={(next) => update({ autoMemoryEnabled: next })}
        />
        <ToggleRow
          icon={Moon}
          name="Auto-dream"
          description="Allows background memory consolidation when Claude Code supports it."
          checked={autoDreamEnabled}
          onChange={(next) => update({ autoDreamEnabled: next })}
        />
        <div className="list-row">
          <div className="glyph">
            <BrainCircuit size={14} />
          </div>
          <div>
            <div className="name">Auto-memory directory</div>
            <div className="desc">Optional custom SDK memory path. Leave blank for Claude Code default.</div>
          </div>
          <input
            className="input"
            value={autoMemoryDirectory}
            onChange={(event) => updateAutoMemoryDirectory(event.target.value)}
            placeholder="~/agentui-memory"
            style={{ maxWidth: 260 }}
          />
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(260px, 360px) minmax(0, 1fr)',
          gap: 16,
          alignItems: 'start'
        }}
      >
        <div className="list-card">
          {list.isPending && (
            <div className="list-row compact">
              <div />
              <div className="desc">Loading SDK memory...</div>
              <div />
            </div>
          )}
          {list.isError && (
            <div className="list-row compact">
              <div />
              <div className="desc" style={{ color: 'var(--color-error)' }}>
                Failed to load SDK memory.
              </div>
              <div />
            </div>
          )}
          {list.data?.roots.map((root) => (
            <div key={root.scope}>
              <div className="list-row compact">
                <div className="glyph">
                  <BrainCircuit size={14} />
                </div>
                <div>
                  <div className="name">{root.label}</div>
                  <div className="desc">
                    {root.exists ? `${rootFileCount(root)} files` : 'not created yet'}
                  </div>
                </div>
                <span className="chip memory-tag">{root.scope}</span>
              </div>
              {root.files.map((file) => (
                <MemoryFileRow
                  key={fileKey(file)}
                  file={file}
                  selected={selected ? fileKey(selected) === fileKey(file) : false}
                  onSelect={setSelected}
                />
              ))}
              {root.agents.map((agent) => (
                <div key={`${root.scope}-${agent.agentName}`}>
                  <div className="list-row compact">
                    <div />
                    <div>
                      <div className="name">{agent.agentName}</div>
                      <div className="desc">{agent.files.length} files</div>
                    </div>
                    <div />
                  </div>
                  {agent.files.map((file) => (
                    <MemoryFileRow
                      key={fileKey(file)}
                      file={file}
                      selected={selected ? fileKey(selected) === fileKey(file) : false}
                      onSelect={setSelected}
                    />
                  ))}
                </div>
              ))}
            </div>
          ))}
          {list.data && files.length === 0 && (
            <div className="list-row compact">
              <div />
              <div className="desc">No SDK memory files yet.</div>
              <div />
            </div>
          )}
        </div>

        <div className="list-card">
          <div className="list-row compact">
            <div className="glyph">
              <FileText size={14} />
            </div>
            <div>
              <div className="name">{selected?.relativePath ?? 'No file selected'}</div>
              <div className="desc">
                {selected
                  ? `${selected.scope}${selected.agentName ? ` / ${selected.agentName}` : ''}`
                  : 'Select a memory file to inspect it.'}
              </div>
            </div>
            <div className="row-actions">
              <button
                type="button"
                className="btn-secondary"
                disabled={!selected || !dirty || save.isPending}
                onClick={() => save.mutate()}
                title="Save memory file"
              >
                <Save size={12} />
              </button>
              <button
                type="button"
                className="btn-danger"
                disabled={!selected || remove.isPending}
                onClick={() => {
                  if (selected && confirm(`Delete SDK memory file "${selected.relativePath}"?`)) {
                    remove.mutate()
                  }
                }}
                title="Delete memory file"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
          {fileQuery.isError && (
            <div className="list-row compact">
              <div />
              <div className="desc" style={{ color: 'var(--color-error)' }}>
                Failed to read selected memory file.
              </div>
              <div />
            </div>
          )}
          <div style={{ padding: 14 }}>
            <textarea
              className="textarea"
              value={content}
              disabled={!selected || fileQuery.isPending}
              onChange={(event) => setContent(event.target.value)}
              placeholder="Select an SDK memory file"
              style={{ minHeight: 360, width: '100%', resize: 'vertical' }}
            />
            {selected && (
              <div className="chrome" style={{ marginTop: 8 }}>
                updated {formatRelativeTime(selected.updatedAt)}
                {dirty ? ' · unsaved changes' : ''}
              </div>
            )}
          </div>
        </div>
      </div>

      <Modal
        open={createOpen}
        onClose={closeCreate}
        title="New SDK memory file"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={closeCreate}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!createValid || create.isPending}
              onClick={() => create.mutate()}
            >
              {create.isPending ? 'Creating...' : 'Create file'}
            </button>
          </>
        }
      >
        <div className="field">
          <label className="field-label">Scope</label>
          <select
            className="select"
            value={newFile.scope}
            onChange={(event) => {
              const scope = event.target.value as SdkMemoryScope
              setNewFile((current) => ({
                ...current,
                scope,
                agentName: isAgentScopedScope(scope) ? current.agentName : ''
              }))
            }}
          >
            {availableRoots.map((root) => (
              <option key={root.scope} value={root.scope}>
                {root.label}
              </option>
            ))}
          </select>
        </div>
        {createNeedsAgent && (
          <div className="field">
            <label className="field-label">Agent name</label>
            <input
              className="input"
              value={newFile.agentName}
              onChange={(event) =>
                setNewFile((current) => ({ ...current, agentName: event.target.value }))
              }
              placeholder="research_agent"
            />
            <span className="chrome" style={{ display: 'block', marginTop: 6 }}>
              Required for user, project, and local memory scopes.
            </span>
          </div>
        )}
        <div className="field">
          <label className="field-label">Relative path</label>
          <input
            className="input"
            value={newFile.relativePath}
            onChange={(event) =>
              setNewFile((current) => ({ ...current, relativePath: event.target.value }))
            }
            placeholder="memory.md"
          />
        </div>
        <div className="field">
          <label className="field-label">Content</label>
          <textarea
            className="textarea"
            value={newFile.content}
            onChange={(event) =>
              setNewFile((current) => ({ ...current, content: event.target.value }))
            }
            placeholder="Write SDK memory content"
            style={{ minHeight: 180 }}
          />
        </div>
        {create.isError && (
          <div style={{ color: 'var(--color-error)', fontSize: 12 }}>
            Create failed. {create.error instanceof Error ? create.error.message : 'unknown error'}
          </div>
        )}
      </Modal>
    </div>
  )
}

function MemoryFileRow({
  file,
  selected,
  onSelect
}: {
  file: SdkMemoryFileDTO
  selected: boolean
  onSelect: (file: SdkMemoryFileDTO) => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={`list-row compact selectable ${selected ? 'active' : ''}`}
      onClick={() => onSelect(file)}
    >
      <div />
      <div>
        <div className="name">{file.relativePath}</div>
        <div className="desc">{file.size.toLocaleString()} bytes</div>
      </div>
      <div />
    </button>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { Keyboard, Pencil, Plus, Trash2 } from 'lucide-react'
import Modal from '../Modal'
import { useKeybindAction } from '../../hooks/useKeybindAction'
import { useKeybinds } from '../../hooks/useKeybinds'
import { useSettings } from '../../hooks/useSettings'
import {
  KEYBIND_ACTIONS,
  KEYBIND_ACTION_BY_ID,
  chordFromKeyboardEvent,
  findEnabledDuplicate,
  formatKeybind,
  normalizeChord,
  reservedKeybindReason,
  type KeybindActionId,
  type KeybindRecord
} from '../../lib/keybinds'

type Draft = {
  actionId: KeybindActionId
  keys: string
  enabled: boolean
}

type EditorProps = {
  open: boolean
  existing: KeybindRecord | null
  keybinds: KeybindRecord[]
  onClose: () => void
  onSave: (draft: Draft) => void
}

function initialDraft(existing: KeybindRecord | null): Draft {
  return {
    actionId: existing?.actionId ?? 'command.openPalette',
    keys: existing?.keys ?? '',
    enabled: existing?.enabled ?? true
  }
}

function duplicateMessage(duplicate: KeybindRecord | null): string {
  if (!duplicate) return ''
  return `Conflicts with ${duplicate.label} (${formatKeybind(duplicate.keys)}).`
}

function KeybindEditor({
  open,
  existing,
  keybinds,
  onClose,
  onSave
}: EditorProps): React.JSX.Element {
  const [draft, setDraft] = useState<Draft>(() => initialDraft(existing))
  const [capturing, setCapturing] = useState(false)
  const [captureError, setCaptureError] = useState('')

  useEffect(() => {
    if (open) {
      setDraft(initialDraft(existing))
      setCapturing(false)
      setCaptureError('')
    }
  }, [open, existing])

  const normalizedKeys = normalizeChord(draft.keys)
  const duplicate = findEnabledDuplicate(keybinds, {
    id: existing?.id ?? 'draft',
    keys: normalizedKeys,
    enabled: draft.enabled
  })
  const conflict = duplicateMessage(duplicate)
  const reserved = reservedKeybindReason(normalizedKeys)
  const valid = !!normalizedKeys && !duplicate && !reserved
  const title = existing ? 'Edit keybind' : 'Add keybind'
  const actionLocked = existing?.source === 'preset'

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
            disabled={!valid}
            onClick={() => {
              if (!valid) return
              onSave({ ...draft, keys: normalizedKeys })
            }}
          >
            Save
          </button>
        </>
      }
    >
      <div className="field">
        <label className="field-label">Action</label>
        <select
          className="select"
          value={draft.actionId}
          disabled={actionLocked}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              actionId: event.target.value as KeybindActionId
            }))
          }
        >
          {KEYBIND_ACTIONS.map((action) => (
            <option key={action.id} value={action.id}>
              {action.group} - {action.label}
            </option>
          ))}
        </select>
        {actionLocked && (
          <span className="chrome keybind-field-note">
            Preset actions keep their original target.
          </span>
        )}
      </div>

      <div className="field">
        <label className="field-label">Shortcut</label>
        <button
          type="button"
          className={`key-capture ${capturing ? 'capturing' : ''}`}
          onClick={() => {
            setCapturing(true)
            setCaptureError('')
          }}
          onKeyDown={(event) => {
            if (!capturing) {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                setCapturing(true)
              }
              return
            }

            event.preventDefault()
            event.stopPropagation()

            if (event.key === 'Escape') {
              setCapturing(false)
              setCaptureError('')
              return
            }

            const chord = chordFromKeyboardEvent(event.nativeEvent)
            if (!chord) {
              setCaptureError('Press one non-modifier key with optional modifiers.')
              return
            }
            setDraft((current) => ({ ...current, keys: chord }))
            setCapturing(false)
            setCaptureError('')
          }}
        >
          <span className="key-capture-value">
            {capturing
              ? 'Press shortcut'
              : normalizedKeys
                ? formatKeybind(normalizedKeys)
                : 'Click to record'}
          </span>
        </button>
        {(captureError || conflict || reserved || !normalizedKeys) && (
          <div className={`keybind-validation ${conflict || reserved ? 'err' : ''}`}>
            {captureError || conflict || reserved || 'Record a shortcut before saving.'}
          </div>
        )}
      </div>

      <div className="field keybind-enabled-field">
        <label className="field-label">Enabled</label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(event) =>
              setDraft((current) => ({ ...current, enabled: event.target.checked }))
            }
          />
          <span className="slider" />
        </label>
        <span className="chrome">{draft.enabled ? 'on' : 'off'}</span>
      </div>
    </Modal>
  )
}

export default function KeybindsTab(): React.JSX.Element {
  const { keybinds, isReady, createKeybind, setKeybinds, updateKeybind, removeKeybind } =
    useKeybinds()
  const { data: settings } = useSettings()
  const showDescriptions = settings?.showDescriptions ?? true
  const [editing, setEditing] = useState<KeybindRecord | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [inlineError, setInlineError] = useState('')

  const enabledCount = keybinds.filter((keybind) => keybind.enabled).length
  const customCount = keybinds.filter((keybind) => keybind.source === 'custom').length
  const grouped = useMemo(() => {
    const groups = new Map<string, KeybindRecord[]>()
    for (const keybind of keybinds) {
      const action = KEYBIND_ACTION_BY_ID.get(keybind.actionId)
      const group = action?.group ?? 'Custom'
      groups.set(group, [...(groups.get(group) ?? []), keybind])
    }
    return [...groups.entries()]
  }, [keybinds])

  const openCreate = (): void => {
    setEditing(null)
    setInlineError('')
    setModalOpen(true)
  }

  useKeybindAction('settings.newKeybind', () => {
    openCreate()
    return true
  })

  const openEdit = (keybind: KeybindRecord): void => {
    setEditing(keybind)
    setInlineError('')
    setModalOpen(true)
  }

  const saveDraft = (draft: Draft): void => {
    if (editing) {
      updateKeybind(editing.id, draft)
    } else {
      setKeybinds([
        ...keybinds,
        { ...createKeybind(draft.actionId, draft.keys), enabled: draft.enabled }
      ])
    }
    setModalOpen(false)
  }

  const setEnabled = (keybind: KeybindRecord, enabled: boolean): void => {
    const reserved = reservedKeybindReason(keybind.keys)
    if (enabled && reserved) {
      setInlineError(reserved)
      return
    }
    const duplicate = findEnabledDuplicate(keybinds, { ...keybind, enabled })
    if (duplicate) {
      setInlineError(duplicateMessage(duplicate))
      return
    }
    setInlineError('')
    updateKeybind(keybind.id, { enabled })
  }

  return (
    <div className="settings-pane keybinds-pane">
      <div className="pane-head">
        <div className="pane-head-text">
          <div className="pane-title">Keybinds</div>
          <div className="pane-sub">
            Configure Windows shortcuts for app and web actions. {enabledCount} of {keybinds.length}{' '}
            enabled{customCount > 0 ? `, ${customCount} custom` : ''}.
          </div>
        </div>
        <div className="row-actions">
          <button type="button" className="btn-primary" onClick={openCreate}>
            <Plus size={12} /> Add keybind
          </button>
        </div>
      </div>

      {inlineError && <div className="keybind-banner">{inlineError}</div>}

      {grouped.length > 0 ? (
        <div className="keybind-groups">
          {grouped.map(([group, records]) => (
            <section key={group} className="keybind-group">
              <div className="keybind-group-head">
                <span className="cap">{group}</span>
                <span className="chrome">{records.length}</span>
              </div>
              <div className="list-card">
                {records.map((keybind) => {
                  const action = KEYBIND_ACTION_BY_ID.get(keybind.actionId)
                  return (
                    <div
                      key={keybind.id}
                      className={`list-row keybind-row ${keybind.enabled ? '' : 'disabled'}`}
                    >
                      <div className="glyph">
                        <Keyboard size={14} />
                      </div>
                      <div className="keybind-copy">
                        <div className="keybind-name-row">
                          <span className="name">{keybind.label}</span>
                          <span className="keybind-source chrome">{keybind.source}</span>
                        </div>
                        <div className="keybind-meta">
                          <span className="keycap">{formatKeybind(keybind.keys)}</span>
                          {!keybind.enabled && <span className="chrome">off</span>}
                        </div>
                        {showDescriptions && keybind.source === 'preset' && action?.description && (
                          <div className="desc">{action.description}</div>
                        )}
                      </div>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => openEdit(keybind)}
                          title="Edit"
                          style={{ padding: '6px 10px' }}
                        >
                          <Pencil size={12} />
                        </button>
                        {keybind.source === 'custom' && (
                          <button
                            type="button"
                            className="btn-danger"
                            onClick={() => removeKeybind(keybind.id)}
                            title="Delete"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                        <label
                          className="toggle"
                          title={keybind.enabled ? 'Disable keybind' : 'Enable keybind'}
                        >
                          <input
                            type="checkbox"
                            checked={keybind.enabled}
                            onChange={(event) => setEnabled(keybind, event.target.checked)}
                          />
                          <span className="slider" />
                        </label>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="list-card">
          <div className="list-row">
            <div />
            <div>
              <div className="desc">{isReady ? 'No keybinds configured.' : 'Loading keybinds...'}</div>
            </div>
            <div />
          </div>
        </div>
      )}

      <KeybindEditor
        open={modalOpen}
        existing={editing}
        keybinds={keybinds}
        onClose={() => setModalOpen(false)}
        onSave={saveDraft}
      />
    </div>
  )
}

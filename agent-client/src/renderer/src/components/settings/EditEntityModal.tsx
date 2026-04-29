import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import Modal from '../Modal'
import { apiFetch } from '../../lib/api'
import type { SkillDTO, SubagentDTO } from '@shared/types'

type Kind = 'skill' | 'subagent'

type Props = {
  open: boolean
  onClose: () => void
  kind: Kind
  /** Existing entity for edit mode; null for create. */
  existing: SkillDTO | SubagentDTO | null
}

const MODELS = ['claude-sonnet-4', 'claude-opus-4', 'claude-haiku-4-5'] as const

const GWS_SERVICES = ['drive', 'gmail', 'calendar', 'sheets', 'docs', 'tasks'] as const
type GwsService = (typeof GWS_SERVICES)[number]

type Draft = {
  name: string
  description: string
  prompt: string
  model: string
  enabled: boolean
  mcpServices: GwsService[]
}

function emptyDraft(): Draft {
  return { name: '', description: '', prompt: '', model: 'claude-sonnet-4', enabled: true, mcpServices: [] }
}

function fromExisting(kind: Kind, existing: SkillDTO | SubagentDTO | null): Draft {
  if (!existing) return emptyDraft()
  if (kind === 'skill') {
    const s = existing as SkillDTO
    return {
      name: s.name,
      description: s.description,
      prompt: s.body,
      model: 'claude-sonnet-4',
      enabled: s.enabled,
      mcpServices: [],
    }
  }
  const s = existing as SubagentDTO
  return {
    name: s.name,
    description: s.description,
    prompt: s.prompt,
    model: s.model ?? 'claude-sonnet-4',
    enabled: s.enabled,
    mcpServices: Array.isArray(s.mcpServices)
      ? (s.mcpServices.filter((v): v is GwsService => GWS_SERVICES.includes(v as GwsService)))
      : [],
  }
}

function toggleService(current: GwsService[], service: GwsService): GwsService[] {
  return current.includes(service) ? current.filter((s) => s !== service) : [...current, service]
}

export default function EditEntityModal({ open, onClose, kind, existing }: Props): React.JSX.Element {
  const [draft, setDraft] = useState<Draft>(() => fromExisting(kind, existing))
  const queryClient = useQueryClient()
  const queryKey = kind === 'skill' ? 'skills' : 'subagents'
  const path = kind === 'skill' ? '/api/skills' : '/api/subagents'

  useEffect(() => {
    if (open) setDraft(fromExisting(kind, existing))
  }, [open, kind, existing])

  const save = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        name: draft.name,
        description: draft.description,
        enabled: draft.enabled,
      }
      if (kind === 'skill') {
        body.body = draft.prompt
      } else {
        body.prompt = draft.prompt
        body.model = draft.model || undefined
        body.mcpServices = draft.mcpServices
      }

      if (existing) {
        return apiFetch(`${path}/${existing._id}`, { method: 'PATCH', body: JSON.stringify(body) })
      }
      return apiFetch(path, { method: 'POST', body: JSON.stringify(body) })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [queryKey] })
      onClose()
    },
  })

  const isValid = draft.name.trim() && draft.description.trim() && (kind === 'skill' || draft.prompt.trim())
  const title = existing ? `Edit ${kind}` : `New ${kind}`

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
            disabled={!isValid || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <div className="field">
        <label className="field-label">Name</label>
        <input
          className="input"
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          placeholder={kind === 'skill' ? 'e.g. translate-md' : 'e.g. email_agent'}
        />
      </div>
      <div className="field">
        <label className="field-label">Description</label>
        <input
          className="input"
          value={draft.description}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          placeholder="One-line summary"
        />
      </div>
      <div className="field">
        <label className="field-label">{kind === 'skill' ? 'Body' : 'Prompt'}</label>
        <textarea
          className="textarea"
          value={draft.prompt}
          onChange={(e) => setDraft((d) => ({ ...d, prompt: e.target.value }))}
          placeholder={kind === 'skill' ? 'Skill body markdown' : 'Subagent system prompt'}
        />
      </div>
      {kind === 'subagent' && (
        <div className="field">
          <label className="field-label">Model</label>
          <select
            className="select"
            value={draft.model}
            onChange={(e) => setDraft((d) => ({ ...d, model: e.target.value }))}
          >
            {MODELS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      )}
      {kind === 'subagent' && (
        <div className="field">
          <label className="field-label">Google Workspace services</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {GWS_SERVICES.map((service) => {
              const checked = draft.mcpServices.includes(service)
              return (
                <label
                  key={service}
                  className="chip"
                  style={{ cursor: 'pointer', userSelect: 'none', opacity: checked ? 1 : 0.7 }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setDraft((d) => ({ ...d, mcpServices: toggleService(d.mcpServices, service) }))
                    }
                    style={{ marginRight: 6 }}
                  />
                  {service}
                </label>
              )
            })}
          </div>
          <span className="chrome" style={{ display: 'block', marginTop: 6 }}>
            Attaches the gws MCP wrapper to this subagent. Requires gws auth login on the host.
          </span>
        </div>
      )}
      <div className="field">
        <label className="field-label">Enabled</label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => setDraft((d) => ({ ...d, enabled: e.target.checked }))}
          />
          <span className="slider" />
        </label>
        <span className="chrome" style={{ marginLeft: 8 }}>
          {draft.enabled ? 'on — written to .claude/' : 'off — file removed'}
        </span>
      </div>
      {save.isError && (
        <div style={{ color: 'var(--color-error)', fontSize: 12 }}>
          Save failed. {save.error instanceof Error ? save.error.message : 'unknown error'}
        </div>
      )}
    </Modal>
  )
}

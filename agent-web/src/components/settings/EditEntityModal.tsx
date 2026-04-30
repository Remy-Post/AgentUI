import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import Modal from '../Modal'
import { apiFetch } from '../../lib/api'
import type { SkillDTO, SubagentDTO, SubagentMemoryScope } from '@shared/types'

type Kind = 'skill' | 'subagent'

type Props = {
  open: boolean
  onClose: () => void
  kind: Kind
  /** Existing entity for edit mode; null for create. */
  existing: SkillDTO | SubagentDTO | null
}

const MODELS = [
  { value: '', label: 'Conversation default' },
  { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { value: 'claude-opus-4-7', label: 'Opus 4.7' },
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' }
] as const

const EFFORTS = [
  { value: '', label: 'Default' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'Extra high' },
  { value: 'max', label: 'Max' }
] as const

const PERMISSION_MODES = [
  { value: 'dontAsk', label: 'Do not ask' },
  { value: 'default', label: 'Default' },
  { value: 'acceptEdits', label: 'Accept edits' },
  { value: 'plan', label: 'Plan' },
  { value: 'auto', label: 'Auto' }
] as const

const GWS_SERVICES = ['drive', 'gmail', 'calendar', 'sheets', 'docs', 'tasks'] as const
type GwsService = (typeof GWS_SERVICES)[number]

const MEMORY_SCOPES: Array<{ value: SubagentMemoryScope; label: string }> = [
  { value: 'local', label: 'Local' },
  { value: 'project', label: 'Project' },
  { value: 'user', label: 'User' },
  { value: 'none', label: 'None' }
]

type Draft = {
  name: string
  description: string
  prompt: string
  model: string
  effort: string
  permissionMode: string
  tools: string
  disallowedTools: string
  enabled: boolean
  mcpServices: GwsService[]
  memory: SubagentMemoryScope
}

function emptyDraft(): Draft {
  return {
    name: '',
    description: '',
    prompt: '',
    model: 'claude-sonnet-4-6',
    effort: '',
    permissionMode: 'dontAsk',
    tools: '',
    disallowedTools: '',
    enabled: true,
    mcpServices: [],
    memory: 'local'
  }
}

function listToText(values: string[] | undefined): string {
  return Array.isArray(values) ? values.join(', ') : ''
}

function parseList(value: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const part of value.split(/[\s,]+/g)) {
    const trimmed = part.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    out.push(trimmed)
  }
  return out
}

function fromExisting(kind: Kind, existing: SkillDTO | SubagentDTO | null): Draft {
  if (!existing) return emptyDraft()
  if (kind === 'skill') {
    const s = existing as SkillDTO
    return {
      name: s.name,
      description: s.description,
      prompt: s.body,
      model: 'claude-sonnet-4-6',
      effort: '',
      permissionMode: 'dontAsk',
      tools: '',
      disallowedTools: '',
      enabled: s.enabled,
      mcpServices: [],
      memory: 'none'
    }
  }
  const s = existing as SubagentDTO
  return {
    name: s.name,
    description: s.description,
    prompt: s.prompt,
    model: s.model ?? '',
    effort: s.effort ?? '',
    permissionMode: s.permissionMode ?? 'dontAsk',
    tools: listToText(s.tools),
    disallowedTools: listToText(s.disallowedTools),
    enabled: s.enabled,
    mcpServices: Array.isArray(s.mcpServices)
      ? s.mcpServices.filter((v): v is GwsService => GWS_SERVICES.includes(v as GwsService))
      : [],
    memory: s.memory ?? 'none'
  }
}

function toggleService(current: GwsService[], service: GwsService): GwsService[] {
  return current.includes(service) ? current.filter((s) => s !== service) : [...current, service]
}

export default function EditEntityModal({
  open,
  onClose,
  kind,
  existing
}: Props): React.JSX.Element {
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
        enabled: draft.enabled
      }
      if (kind === 'skill') {
        body.body = draft.prompt
      } else {
        body.prompt = draft.prompt
        body.model = draft.model || undefined
        body.effort = draft.effort || undefined
        body.permissionMode = draft.permissionMode || undefined
        body.tools = parseList(draft.tools)
        body.disallowedTools = parseList(draft.disallowedTools)
        body.mcpServices = draft.mcpServices
        body.memory = draft.memory
      }

      if (existing) {
        return apiFetch(`${path}/${existing._id}`, { method: 'PATCH', body: JSON.stringify(body) })
      }
      return apiFetch(path, { method: 'POST', body: JSON.stringify(body) })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [queryKey] })
      onClose()
    }
  })

  const isValid =
    draft.name.trim() && draft.description.trim() && (kind === 'skill' || draft.prompt.trim())
  const title = existing ? `Edit ${kind}` : `New ${kind}`
  const idPrefix = `${kind}-entity`

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
        <label className="field-label" htmlFor={`${idPrefix}-name`}>Name</label>
        <input
          id={`${idPrefix}-name`}
          className="input"
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          placeholder={kind === 'skill' ? 'e.g. translate-md' : 'e.g. email_agent'}
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor={`${idPrefix}-description`}>Description</label>
        <input
          id={`${idPrefix}-description`}
          className="input"
          value={draft.description}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          placeholder="One-line summary"
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor={`${idPrefix}-prompt`}>{kind === 'skill' ? 'Body' : 'Prompt'}</label>
        <textarea
          id={`${idPrefix}-prompt`}
          className="textarea"
          value={draft.prompt}
          onChange={(e) => setDraft((d) => ({ ...d, prompt: e.target.value }))}
          placeholder={kind === 'skill' ? 'Skill body markdown' : 'Subagent system prompt'}
        />
      </div>
      {kind === 'subagent' && (
        <div className="subagent-field-grid">
          <div className="field">
            <label className="field-label" htmlFor={`${idPrefix}-model`}>Model</label>
            <select
              id={`${idPrefix}-model`}
              className="select"
              value={draft.model}
              onChange={(e) => setDraft((d) => ({ ...d, model: e.target.value }))}
            >
              {MODELS.map((m) => (
                <option key={m.value || 'default'} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label" htmlFor={`${idPrefix}-effort`}>Effort</label>
            <select
              id={`${idPrefix}-effort`}
              className="select"
              value={draft.effort}
              onChange={(e) => setDraft((d) => ({ ...d, effort: e.target.value }))}
            >
              {EFFORTS.map((effort) => (
                <option key={effort.value || 'default'} value={effort.value}>
                  {effort.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label" htmlFor={`${idPrefix}-permission`}>Permission</label>
            <select
              id={`${idPrefix}-permission`}
              className="select"
              value={draft.permissionMode}
              onChange={(e) => setDraft((d) => ({ ...d, permissionMode: e.target.value }))}
            >
              {PERMISSION_MODES.map((mode) => (
                <option key={mode.value} value={mode.value}>
                  {mode.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label" htmlFor={`${idPrefix}-memory`}>Memory</label>
            <select
              id={`${idPrefix}-memory`}
              className="select"
              value={draft.memory}
              onChange={(e) =>
                setDraft((d) => ({ ...d, memory: e.target.value as SubagentMemoryScope }))
              }
            >
              {MEMORY_SCOPES.map((scope) => (
                <option key={scope.value} value={scope.value}>
                  {scope.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
      {kind === 'subagent' && (
        <div className="field">
          <label className="field-label" htmlFor={`${idPrefix}-tools`}>Allowed tools</label>
          <textarea
            id={`${idPrefix}-tools`}
            className="textarea compact-textarea"
            value={draft.tools}
            onChange={(e) => setDraft((d) => ({ ...d, tools: e.target.value }))}
            placeholder="Read, Grep, Glob, WebSearch"
          />
        </div>
      )}
      {kind === 'subagent' && (
        <div className="field">
          <label className="field-label" htmlFor={`${idPrefix}-denied-tools`}>Denied tools</label>
          <textarea
            id={`${idPrefix}-denied-tools`}
            className="textarea compact-textarea"
            value={draft.disallowedTools}
            onChange={(e) => setDraft((d) => ({ ...d, disallowedTools: e.target.value }))}
            placeholder="Bash, Write, Agent"
          />
        </div>
      )}
      {kind === 'subagent' && (
        <div className="field">
          <label className="field-label">Google Workspace services</label>
          <div className="chip-toggle-row" role="group" aria-label="Google Workspace services">
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
                    aria-label={`Allow ${service}`}
                    onChange={() =>
                      setDraft((d) => ({
                        ...d,
                        mcpServices: toggleService(d.mcpServices, service)
                      }))
                    }
                    style={{ marginRight: 6 }}
                  />
                  {service}
                </label>
              )
            })}
          </div>
        </div>
      )}
      <div className="field">
        <label className="field-label">Enabled</label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={draft.enabled}
            aria-label={`Enable ${kind}`}
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

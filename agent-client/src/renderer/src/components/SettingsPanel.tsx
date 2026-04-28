import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { apiFetch } from '../lib/api'
import type { SkillDTO, SubagentDTO } from '@shared/types'

type Props = {
  onClose: () => void
}

export default function SettingsPanel({ onClose }: Props): React.JSX.Element {
  const [tab, setTab] = useState<'api' | 'subagents' | 'skills'>('api')

  return (
    <div className="flex h-full flex-col bg-zinc-950">
      <header className="flex items-center gap-3 border-b border-zinc-800 px-6 py-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          title="Back"
        >
          <ArrowLeft size={16} />
        </button>
        <h2 className="text-sm font-semibold text-zinc-200">Settings</h2>
      </header>

      <nav className="flex gap-1 border-b border-zinc-800 px-4">
        {(['api', 'subagents', 'skills'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm ${
              tab === t ? 'border-b-2 border-blue-500 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {t === 'api' ? 'API key' : t}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {tab === 'api' && <ApiKeyTab />}
        {tab === 'subagents' && <SubagentsTab />}
        {tab === 'skills' && <SkillsTab />}
      </div>
    </div>
  )
}

function ApiKeyTab(): React.JSX.Element {
  const [key, setKey] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const hasKeyQuery = useQuery({ queryKey: ['hasApiKey'], queryFn: () => window.api.hasApiKey() })

  const save = async (): Promise<void> => {
    setStatus(null)
    if (!key.trim()) {
      setStatus('Enter a key first.')
      return
    }
    const result = await window.api.setApiKey(key.trim())
    if (result.ok) {
      setStatus('Saved. Restart the app for the server to pick up the new key.')
      setKey('')
    } else {
      setStatus(`Failed: ${result.reason}`)
    }
  }

  return (
    <div className="max-w-xl space-y-4 text-sm">
      <p className="text-zinc-400">
        Stored locally via Electron safeStorage. The key is decrypted at app start and passed to the
        Express child as <code>ANTHROPIC_API_KEY</code>.
      </p>
      <div className="text-zinc-300">
        Current state: {hasKeyQuery.data ? 'configured' : 'not set'}
      </div>
      <input
        type="password"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder="sk-ant-..."
        className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100 outline-none focus:border-blue-500"
      />
      <button
        type="button"
        onClick={save}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500"
      >
        Save
      </button>
      {status && <p className="text-xs text-zinc-400">{status}</p>}
    </div>
  )
}

type SubagentDraft = Partial<Pick<SubagentDTO, 'name' | 'description' | 'prompt' | 'model' | 'effort' | 'permissionMode'>> & {
  enabled?: boolean
}

function SubagentsTab(): React.JSX.Element {
  const queryClient = useQueryClient()
  const list = useQuery({
    queryKey: ['subagents'],
    queryFn: () => apiFetch<SubagentDTO[]>('/api/subagents'),
  })
  const [draft, setDraft] = useState<SubagentDraft>({ enabled: true })

  const create = useMutation({
    mutationFn: (body: SubagentDraft) =>
      apiFetch<SubagentDTO>('/api/subagents', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      setDraft({ enabled: true })
      queryClient.invalidateQueries({ queryKey: ['subagents'] })
    },
  })

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/subagents/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['subagents'] }),
  })

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 text-sm font-semibold text-zinc-200">Subagents</h3>
        <ul className="space-y-2">
          {list.data?.map((s) => (
            <li key={s._id} className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm">
              <div>
                <div className="text-zinc-100">{s.name}</div>
                <div className="text-xs text-zinc-500">{s.description}</div>
              </div>
              <button
                type="button"
                onClick={() => remove.mutate(s._id)}
                className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-red-400"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
          {list.data && list.data.length === 0 && (
            <li className="text-xs text-zinc-500">No subagents yet.</li>
          )}
        </ul>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-zinc-200">Add subagent</h3>
        <input
          placeholder="name (e.g. email_agent)"
          value={draft.name ?? ''}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500"
        />
        <input
          placeholder="description"
          value={draft.description ?? ''}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500"
        />
        <textarea
          placeholder="prompt"
          rows={5}
          value={draft.prompt ?? ''}
          onChange={(e) => setDraft((d) => ({ ...d, prompt: e.target.value }))}
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500"
        />
        <button
          type="button"
          onClick={() => create.mutate(draft)}
          disabled={!draft.name || !draft.description || !draft.prompt}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500 disabled:bg-zinc-700"
        >
          Create
        </button>
      </section>
    </div>
  )
}

type SkillDraft = Partial<Pick<SkillDTO, 'name' | 'description' | 'body'>> & { enabled?: boolean }

function SkillsTab(): React.JSX.Element {
  const queryClient = useQueryClient()
  const list = useQuery({
    queryKey: ['skills'],
    queryFn: () => apiFetch<SkillDTO[]>('/api/skills'),
  })
  const [draft, setDraft] = useState<SkillDraft>({ enabled: true })

  const create = useMutation({
    mutationFn: (body: SkillDraft) =>
      apiFetch<SkillDTO>('/api/skills', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      setDraft({ enabled: true })
      queryClient.invalidateQueries({ queryKey: ['skills'] })
    },
  })

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/skills/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['skills'] }),
  })

  useEffect(() => {
    void list
  }, [list])

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 text-sm font-semibold text-zinc-200">Skills</h3>
        <ul className="space-y-2">
          {list.data?.map((s) => (
            <li key={s._id} className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm">
              <div>
                <div className="text-zinc-100">{s.name}</div>
                <div className="text-xs text-zinc-500">{s.description}</div>
              </div>
              <button
                type="button"
                onClick={() => remove.mutate(s._id)}
                className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-red-400"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
          {list.data && list.data.length === 0 && (
            <li className="text-xs text-zinc-500">No skills yet.</li>
          )}
        </ul>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-zinc-200">Add skill</h3>
        <input
          placeholder="name"
          value={draft.name ?? ''}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500"
        />
        <input
          placeholder="description"
          value={draft.description ?? ''}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500"
        />
        <textarea
          placeholder="body"
          rows={5}
          value={draft.body ?? ''}
          onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500"
        />
        <button
          type="button"
          onClick={() => create.mutate(draft)}
          disabled={!draft.name || !draft.description}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500 disabled:bg-zinc-700"
        >
          Create
        </button>
      </section>
    </div>
  )
}

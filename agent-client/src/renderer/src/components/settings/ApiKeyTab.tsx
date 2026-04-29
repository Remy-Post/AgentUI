import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, AlertCircle, Plug } from 'lucide-react'
import { getServerOrigin } from '../../lib/api'

export default function ApiKeyTab(): React.JSX.Element {
  const [key, setKey] = useState('')
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const hasKeyQuery = useQuery({ queryKey: ['hasApiKey'], queryFn: () => window.api.hasApiKey() })

  const save = async (): Promise<void> => {
    setStatus(null)
    if (!key.trim()) {
      setStatus({ kind: 'err', message: 'Enter a key first.' })
      return
    }
    const result = await window.api.setApiKey(key.trim())
    if (result.ok) {
      setStatus({
        kind: 'ok',
        message: 'Saved. Restart the app for the server to pick up the new key.'
      })
      setKey('')
      void hasKeyQuery.refetch()
    } else {
      setStatus({ kind: 'err', message: `Failed: ${result.reason}` })
    }
  }

  const test = async (): Promise<void> => {
    setStatus(null)
    setTesting(true)
    try {
      const origin = await getServerOrigin()
      if (!origin) {
        setStatus({ kind: 'err', message: 'Server not reachable.' })
        return
      }
      const res = await fetch(`${origin}/health`)
      if (!res.ok) {
        setStatus({ kind: 'err', message: `Health check returned ${res.status}.` })
        return
      }
      const json = (await res.json()) as { db?: string; sdk?: string }
      setStatus({
        kind: json.db === 'up' && json.sdk === 'ready' ? 'ok' : 'err',
        message: `db: ${json.db ?? '?'} · sdk: ${json.sdk ?? '?'}`
      })
    } catch (error) {
      setStatus({ kind: 'err', message: error instanceof Error ? error.message : 'unknown error' })
    } finally {
      setTesting(false)
    }
  }

  const configured = hasKeyQuery.data === true

  return (
    <div className="settings-pane">
      <div className="pane-head">
        <div className="pane-head-text">
          <div className="pane-title">API key</div>
          <div className="pane-sub">
            Stored locally via Electron <span className="mono">safeStorage</span>. Decrypted at app
            start and passed to the Express child as <span className="mono">ANTHROPIC_API_KEY</span>
            .
          </div>
        </div>
      </div>

      <div className="field">
        <label className="field-label">Current state</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: configured ? 'var(--color-good)' : 'var(--color-error)'
            }}
          />
          <span style={{ fontSize: 13, color: 'var(--color-ink-2)' }}>
            {configured ? 'configured' : 'not set'}
          </span>
        </div>
      </div>

      <div className="field">
        <label className="field-label">API key</label>
        <input
          className="input"
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={configured ? '••••••••••••••••••••••••••••••' : 'sk-ant-…'}
        />
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn-primary" onClick={save}>
          <Check size={12} /> Save key
        </button>
        <button type="button" className="btn-secondary" onClick={test} disabled={testing}>
          <Plug size={12} /> {testing ? 'Testing…' : 'Test connection'}
        </button>
      </div>

      {status && (
        <div
          style={{
            marginTop: 14,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            color: status.kind === 'ok' ? 'var(--color-good)' : 'var(--color-error)'
          }}
        >
          {status.kind === 'ok' ? <Check size={12} /> : <AlertCircle size={12} />}
          {status.message}
        </div>
      )}
    </div>
  )
}

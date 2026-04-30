import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, AlertCircle, Plug, KeyRound, ShieldCheck } from 'lucide-react'
import { apiFetch } from '../../lib/api'
import type { GitHubAuthDTO } from '@shared/types'

type Status = { kind: 'ok' | 'err'; message: string } | null

function SecretState({ configured }: { configured: boolean }): React.JSX.Element {
  return (
    <div className="secret-state">
      <span className={`secret-dot ${configured ? 'ok' : 'err'}`} />
      <span>{configured ? 'configured' : 'not set'}</span>
    </div>
  )
}

function StatusLine({ status }: { status: Exclude<Status, null> }): React.JSX.Element {
  return (
    <div className={`settings-status ${status.kind}`}>
      {status.kind === 'ok' ? <Check size={12} /> : <AlertCircle size={12} />}
      {status.message}
    </div>
  )
}

export default function ApiKeyTab(): React.JSX.Element {
  const [key, setKey] = useState('')
  const [githubToken, setGithubToken] = useState('')
  const [apiStatus, setApiStatus] = useState<Status>(null)
  const [githubStatus, setGithubStatus] = useState<Status>(null)
  const [testResult, setTestResult] = useState<'ok' | 'err' | null>(null)
  const [testing, setTesting] = useState(false)
  const [savingGithub, setSavingGithub] = useState(false)
  const testResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (testResetTimer.current) clearTimeout(testResetTimer.current)
    }
  }, [])

  const scheduleTestResultClear = (): void => {
    if (testResetTimer.current) clearTimeout(testResetTimer.current)
    testResetTimer.current = setTimeout(() => setTestResult(null), 3000)
  }

  const hasKeyQuery = useQuery({ queryKey: ['hasApiKey'], queryFn: () => window.api.hasApiKey() })
  const hasGithubTokenQuery = useQuery({
    queryKey: ['hasGitHubToken'],
    queryFn: () => window.api.hasGitHubToken()
  })

  const save = async (): Promise<void> => {
    setApiStatus(null)
    setTestResult(null)
    if (!key.trim()) {
      setApiStatus({ kind: 'err', message: 'Enter a key first.' })
      return
    }
    const result = await window.api.setApiKey(key.trim())
    if (result.ok) {
      setApiStatus({
        kind: 'ok',
        message: 'Saved. Restart the app for the server to pick up the new key.'
      })
      setKey('')
      void hasKeyQuery.refetch()
    } else {
      setApiStatus({ kind: 'err', message: `Failed: ${result.reason}` })
    }
  }

  const saveGithubToken = async (): Promise<void> => {
    const trimmed = githubToken.trim()
    setGithubStatus(null)
    if (!trimmed) {
      setGithubStatus({ kind: 'err', message: 'Enter a GitHub token first.' })
      return
    }

    setSavingGithub(true)
    try {
      const result = await window.api.setGitHubToken(trimmed)
      if (!result.ok) {
        setGithubStatus({ kind: 'err', message: `Failed: ${result.reason}` })
        return
      }

      let liveSynced = true
      try {
        await apiFetch<GitHubAuthDTO>('/api/github/auth/token', {
          method: 'PUT',
          body: JSON.stringify({ token: trimmed })
        })
      } catch {
        liveSynced = false
      }

      setGithubToken('')
      void hasGithubTokenQuery.refetch()
      setGithubStatus({
        kind: 'ok',
        message: liveSynced
          ? 'Saved. Private repository access is available now and persists across restarts.'
          : 'Saved locally. Restart the app if private repository access is not available yet.'
      })
    } finally {
      setSavingGithub(false)
    }
  }

  const test = async (): Promise<void> => {
    setApiStatus(null)
    setTestResult(null)
    if (testResetTimer.current) clearTimeout(testResetTimer.current)
    setTesting(true)
    try {
      const json = await apiFetch<{ db?: string; sdk?: string }>('/health')
      setTestResult(json.db === 'up' && json.sdk === 'ready' ? 'ok' : 'err')
    } catch {
      setTestResult('err')
    } finally {
      setTesting(false)
      scheduleTestResultClear()
    }
  }

  const configured = hasKeyQuery.data === true
  const githubConfigured = hasGithubTokenQuery.data === true

  return (
    <div className="settings-pane">
      <div className="pane-head">
        <div className="pane-head-text">
          <div className="pane-title">Keys</div>
          <div className="pane-sub">
            Stored locally via Electron <span className="mono">safeStorage</span> and restored on
            app start. Secrets are not stored in MongoDB.
          </div>
        </div>
      </div>

      <section className="settings-key-card">
        <div className="settings-key-icon">
          <KeyRound size={14} />
        </div>
        <div className="settings-key-body">
          <div className="settings-key-head">
            <div>
              <div className="settings-key-title">Claude API key</div>
              <div className="settings-key-sub">
                Passed to the server as <span className="mono">ANTHROPIC_API_KEY</span>.
              </div>
            </div>
            <SecretState configured={configured} />
          </div>

          <div className="field">
            <label className="field-label">API key</label>
            <input
              className="input"
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={configured ? 'sk-ant-************************' : 'sk-ant-...'}
            />
          </div>

          <div className="settings-actions">
            <button type="button" className="btn-primary" onClick={save}>
              <Check size={12} /> Save key
            </button>
            <button
              type="button"
              className={`btn-secondary${testResult ? ` ${testResult}` : ''}`}
              onClick={test}
              disabled={testing}
            >
              <Plug size={12} /> {testing ? 'Testing...' : 'Test connection'}
            </button>
          </div>

          {apiStatus && <StatusLine status={apiStatus} />}
        </div>
      </section>

      <section className="settings-key-card">
        <div className="settings-key-icon">
          <ShieldCheck size={14} />
        </div>
        <div className="settings-key-body">
          <div className="settings-key-head">
            <div>
              <div className="settings-key-title">GitHub token</div>
              <div className="settings-key-sub">
                Required only for private repositories. Use a fine-grained token with repository
                Contents read access.
              </div>
            </div>
            <SecretState configured={githubConfigured} />
          </div>

          <div className="settings-token-row">
            <input
              className="input"
              type="password"
              value={githubToken}
              onChange={(e) => setGithubToken(e.target.value)}
              placeholder={githubConfigured ? 'github_pat_****************' : 'github_pat_...'}
            />
            <button
              type="button"
              className="btn-secondary"
              onClick={saveGithubToken}
              disabled={savingGithub}
            >
              <ShieldCheck size={12} /> {savingGithub ? 'Saving...' : 'Save'}
            </button>
          </div>

          {githubStatus && <StatusLine status={githubStatus} />}
        </div>
      </section>
    </div>
  )
}

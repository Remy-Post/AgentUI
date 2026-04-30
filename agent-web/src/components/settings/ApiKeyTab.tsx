import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, AlertCircle, Plug, KeyRound, ShieldCheck } from 'lucide-react'
import { apiFetch, getServerOrigin } from '../../lib/api'
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

function ServerEnvState(): React.JSX.Element {
  return (
    <div className="secret-state">
      <span className="secret-dot ok" />
      <span>server env</span>
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
  const [githubToken, setGithubToken] = useState('')
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

  const hasGithubTokenQuery = useQuery({
    queryKey: ['hasGitHubToken'],
    queryFn: () => apiFetch<GitHubAuthDTO>('/api/github/auth')
  })

  const saveGithubToken = async (): Promise<void> => {
    const trimmed = githubToken.trim()
    setGithubStatus(null)
    if (!trimmed) {
      setGithubStatus({ kind: 'err', message: 'Enter a GitHub token first.' })
      return
    }

    setSavingGithub(true)
    try {
      await apiFetch<GitHubAuthDTO>('/api/github/auth/token', {
        method: 'PUT',
        body: JSON.stringify({ token: trimmed })
      })
      setGithubToken('')
      void hasGithubTokenQuery.refetch()
      setGithubStatus({
        kind: 'ok',
        message:
          'Applied to the running server. Set GITHUB_TOKEN in the server environment to persist it across restarts.'
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setGithubStatus({ kind: 'err', message: `Failed: ${message}` })
    } finally {
      setSavingGithub(false)
    }
  }

  const test = async (): Promise<void> => {
    setTestResult(null)
    if (testResetTimer.current) clearTimeout(testResetTimer.current)
    setTesting(true)
    try {
      const origin = await getServerOrigin()
      if (!origin) {
        setTestResult('err')
        return
      }
      const res = await fetch(`${origin}/health`)
      if (!res.ok) {
        setTestResult('err')
        return
      }
      const json = (await res.json()) as { db?: string; sdk?: string }
      setTestResult(json.db === 'up' && json.sdk === 'ready' ? 'ok' : 'err')
    } catch {
      setTestResult('err')
    } finally {
      setTesting(false)
      scheduleTestResultClear()
    }
  }

  const githubConfigured = hasGithubTokenQuery.data?.hasToken === true

  return (
    <div className="settings-pane">
      <div className="pane-head">
        <div className="pane-head-text">
          <div className="pane-title">Keys</div>
          <div className="pane-sub">
            Browser sessions use secrets from the local server environment. Secrets are not stored
            in MongoDB or browser storage.
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
                Read by <span className="mono">agent-server</span> from{' '}
                <span className="mono">ANTHROPIC_API_KEY</span>.
              </div>
            </div>
            <ServerEnvState />
          </div>

          <div className="settings-actions">
            <button
              type="button"
              className={`btn-secondary${testResult ? ` ${testResult}` : ''}`}
              onClick={test}
              disabled={testing}
            >
              <Plug size={12} /> {testing ? 'Testing...' : 'Test connection'}
            </button>
          </div>
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
                Required only for private repositories. This browser can apply a token to the
                running server, but persistence belongs in <span className="mono">GITHUB_TOKEN</span>.
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

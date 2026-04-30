import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Check,
  FileCode,
  Folder,
  GitBranch,
  Lock,
  Loader2,
  RefreshCw
} from 'lucide-react'
import Modal from '../Modal'
import { apiFetch } from '../../lib/api'
import type {
  GitHubAuthDTO,
  GitHubIngestDTO,
  GitHubPreviewDTO,
  GitHubTreeEntryDTO
} from '@shared/types'

type Props = {
  open: boolean
  conversationId: string | null
  onClose: () => void
  onIngested: () => void
}

type Status = { kind: 'ok' | 'err' | 'info'; message: string } | null

function friendlyError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  const match = /^request_failed_(\d+)_(.*)$/.exec(raw)
  if (!match) return raw
  const status = match[1]
  const body = match[2]
  try {
    const parsed = JSON.parse(body) as { message?: string; error?: string }
    return parsed.message ?? parsed.error ?? `Request failed (${status}).`
  } catch {
    return body || `Request failed (${status}).`
  }
}

function formatBytes(value: number | undefined): string {
  if (typeof value !== 'number') return '-'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function depth(path: string): number {
  return path.split('/').length - 1
}

function isAncestorPath(parent: string, child: string): boolean {
  return child.startsWith(`${parent}/`)
}

function selectedFileCount(entries: GitHubTreeEntryDTO[], selected: Set<string>): number {
  return entries.filter((entry) => {
    if (entry.type !== 'file' || entry.skipped) return false
    if (selected.has(entry.path)) return true
    return [...selected].some((path) => {
      const selectedEntry = entries.find((candidate) => candidate.path === path)
      return selectedEntry?.type === 'dir' && isAncestorPath(path, entry.path)
    })
  }).length
}

export default function GitHubContextModal({
  open,
  conversationId,
  onClose,
  onIngested
}: Props): React.JSX.Element {
  const [repoUrl, setRepoUrl] = useState('')
  const [ref, setRef] = useState('')
  const [auth, setAuth] = useState<GitHubAuthDTO | null>(null)
  const [preview, setPreview] = useState<GitHubPreviewDTO | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [result, setResult] = useState<GitHubIngestDTO | null>(null)
  const [status, setStatus] = useState<Status>(null)
  const [loadingAuth, setLoadingAuth] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [ingesting, setIngesting] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoadingAuth(true)
    apiFetch<GitHubAuthDTO>('/api/github/auth')
      .then(setAuth)
      .catch((error) => setStatus({ kind: 'err', message: friendlyError(error) }))
      .finally(() => setLoadingAuth(false))
  }, [open])

  const selectedCount = useMemo(
    () => selectedFileCount(preview?.entries ?? [], selected),
    [preview, selected]
  )
  const rootSelectableEntries = useMemo(
    () =>
      (preview?.entries ?? []).filter(
        (entry) => entry.parentPath === '' && entry.type !== 'submodule' && !entry.skipped
      ),
    [preview]
  )
  const rootSelectionComplete =
    rootSelectableEntries.length > 0 &&
    rootSelectableEntries.every((entry) => selected.has(entry.path))

  const loadPreview = async (): Promise<void> => {
    if (!conversationId) return
    setPreviewing(true)
    setResult(null)
    setStatus(null)
    try {
      const dto = await apiFetch<GitHubPreviewDTO>(`/api/sessions/${conversationId}/github/preview`, {
        method: 'POST',
        body: JSON.stringify({ url: repoUrl, ref: ref.trim() || undefined })
      })
      setPreview(dto)
      setSelected(new Set(dto.defaultSelectedPaths))
      setStatus({
        kind: 'info',
        message: `${dto.defaultSelectedPaths.length} files selected by default.`
      })
    } catch (error) {
      setStatus({ kind: 'err', message: friendlyError(error) })
    } finally {
      setPreviewing(false)
    }
  }

  const toggleEntry = (entry: GitHubTreeEntryDTO): void => {
    if (entry.type === 'submodule' || entry.skipped) return
    setSelected((current) => {
      const next = new Set(current)
      if (entry.type === 'dir') {
        if (next.has(entry.path)) {
          next.delete(entry.path)
        } else {
          next.add(entry.path)
          for (const value of next) {
            if (isAncestorPath(entry.path, value)) next.delete(value)
          }
        }
        return next
      }

      const ancestorDir = [...next].find((path) => {
        const selectedEntry = preview?.entries.find((candidate) => candidate.path === path)
        return selectedEntry?.type === 'dir' && isAncestorPath(path, entry.path)
      })
      if (ancestorDir) {
        next.delete(ancestorDir)
        preview?.entries.forEach((candidate) => {
          if (
            candidate.type === 'file' &&
            !candidate.skipped &&
            isAncestorPath(ancestorDir, candidate.path) &&
            candidate.path !== entry.path
          ) {
            next.add(candidate.path)
          }
        })
        return next
      }

      if (next.has(entry.path)) next.delete(entry.path)
      else next.add(entry.path)
      return next
    })
  }

  const addAllRootEntries = (): void => {
    setSelected((current) => {
      const next = new Set(current)
      rootSelectableEntries.forEach((entry) => {
        next.add(entry.path)
        if (entry.type === 'dir') {
          for (const value of next) {
            if (isAncestorPath(entry.path, value)) next.delete(value)
          }
        }
      })
      return next
    })
  }

  const isChecked = (entry: GitHubTreeEntryDTO): boolean => {
    if (selected.has(entry.path)) return true
    if (entry.type !== 'file') return false
    return [...selected].some((path) => {
      const selectedEntry = preview?.entries.find((candidate) => candidate.path === path)
      return selectedEntry?.type === 'dir' && isAncestorPath(path, entry.path)
    })
  }

  const ingest = async (): Promise<void> => {
    if (!conversationId || !preview) return
    setIngesting(true)
    setStatus(null)
    try {
      const dto = await apiFetch<GitHubIngestDTO>(`/api/sessions/${conversationId}/github/ingest`, {
        method: 'POST',
        body: JSON.stringify({
          url: repoUrl,
          ref: ref.trim() || preview.repository.ref,
          selectedPaths: [...selected]
        })
      })
      setResult(dto)
      setStatus({
        kind: 'ok',
        message: `${dto.ingestedFileCount} files added as ${dto.chunkCount} context chunks.`
      })
      onIngested()
    } catch (error) {
      setStatus({ kind: 'err', message: friendlyError(error) })
    } finally {
      setIngesting(false)
    }
  }

  const footer = (
    <>
      <button type="button" className="btn-secondary" onClick={onClose} disabled={ingesting}>
        Close
      </button>
      <button
        type="button"
        className="btn-primary"
        onClick={ingest}
        disabled={!preview || selectedCount === 0 || ingesting || !conversationId}
      >
        {ingesting ? <Loader2 size={12} className="spin" /> : <Check size={12} />}
        {ingesting ? 'Ingesting...' : `Ingest ${selectedCount}`}
      </button>
    </>
  )

  return (
    <Modal open={open} onClose={onClose} title="Add from GitHub" footer={footer}>
      <div className="github-context-flow">
        <div className="github-auth-row">
          <div className="glyph">
            <Lock size={14} />
          </div>
          <div className="github-auth-copy">
            <div className="name">Private repository access</div>
            <div className="desc">
              {loadingAuth
                ? 'Checking private access...'
                : auth?.hasToken
                  ? 'Private repository access is configured.'
                  : 'Public repositories can be previewed without private access.'}
            </div>
          </div>
        </div>

        <div className="github-input-grid">
          <div className="field">
            <label className="field-label">Repository URL</label>
            <input
              className="input"
              value={repoUrl}
              onChange={(event) => setRepoUrl(event.target.value)}
              placeholder="https://github.com/owner/repo"
            />
          </div>
          <div className="field">
            <label className="field-label">Branch or ref</label>
            <input
              className="input"
              value={ref}
              onChange={(event) => setRef(event.target.value)}
              placeholder="default"
            />
          </div>
          <button
            type="button"
            className="btn-secondary github-preview-btn"
            onClick={loadPreview}
            disabled={previewing || !conversationId}
          >
            {previewing ? <Loader2 size={12} className="spin" /> : <RefreshCw size={12} />}
            Preview
          </button>
        </div>

        {status && (
          <div className={`github-status ${status.kind}`}>
            {status.kind === 'err' ? <AlertCircle size={13} /> : <Check size={13} />}
            <span>{status.message}</span>
          </div>
        )}

        {preview && (
          <>
            <div className="github-repo-summary">
              <span className="chip">
                <GitBranch size={12} />
                {preview.repository.fullName}
              </span>
              <span className="chip">{preview.repository.private ? 'private' : 'public'}</span>
              <span className="chip mono">{preview.repository.ref}</span>
              {preview.repository.treeTruncated && <span className="chip">tree truncated</span>}
            </div>

            <div className="github-tree-actions">
              <span className="chrome">
                {selectedCount} selected · {rootSelectableEntries.length} root items available
              </span>
              <button
                type="button"
                className="btn-secondary"
                onClick={addAllRootEntries}
                disabled={rootSelectableEntries.length === 0 || rootSelectionComplete}
              >
                Add all
              </button>
            </div>

            <div className="github-tree list-card">
              {preview.entries.length === 0 ? (
                <div className="list-row">
                  <div />
                  <div className="desc">No files found.</div>
                  <div />
                </div>
              ) : (
                preview.entries.map((entry) => (
                  <label
                    key={entry.path}
                    className={`list-row compact github-tree-row ${entry.skipped ? 'disabled' : ''}`}
                    style={{ ['--depth' as string]: depth(entry.path) }}
                    title={entry.skipped ? entry.skipReason : entry.path}
                  >
                    <div className="glyph">
                      {entry.type === 'dir' ? <Folder size={13} /> : <FileCode size={13} />}
                    </div>
                    <div className="github-tree-copy">
                      <div className="name">{entry.name}</div>
                      <div className="desc">
                        <span className="mono">{entry.path}</span>
                        {entry.type === 'file' && (
                          <>
                            {' '}
                            - {entry.language ?? 'text'} - {formatBytes(entry.size)}
                          </>
                        )}
                        {entry.skipped ? ` - skipped: ${entry.skipReason}` : ''}
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={isChecked(entry)}
                      disabled={entry.type === 'submodule' || entry.skipped}
                      onChange={() => toggleEntry(entry)}
                    />
                  </label>
                ))
              )}
            </div>
          </>
        )}

        {result && (
          <div className="github-result list-card">
            <div className="list-row compact">
              <div className="glyph">
                <Check size={13} />
              </div>
              <div>
                <div className="name">Ingestion complete</div>
                <div className="desc">
                  {result.ingestedFileCount}/{result.selectedFileCount} files, {result.chunkCount} chunks.
                </div>
              </div>
              <span className="chrome">{result.repository.commitSha.slice(0, 7)}</span>
            </div>
            {[...result.skipped.slice(0, 6), ...result.errors.slice(0, 6).map((e) => ({ path: e.path, reason: e.message }))].map(
              (item) => (
                <div key={`${item.path}-${item.reason}`} className="list-row compact">
                  <div />
                  <div>
                    <div className="name">{item.path}</div>
                    <div className="desc">{item.reason}</div>
                  </div>
                  <div />
                </div>
              )
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}

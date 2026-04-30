import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  Bug,
  CornerDownLeft,
  GitBranchPlus,
  Loader2,
  Map,
  Minimize2,
  Search,
  SlidersHorizontal
} from 'lucide-react'
import ContextDisk from './ContextDisk'
import Modal from './Modal'
import { useContextWindow } from '../hooks/useContextWindow'
import type { TurnMode } from '@shared/types'

type ToggleKey = 'plan' | 'research' | 'debug'

type ToggleDef = {
  key: ToggleKey
  label: string
  description: string
  icon: React.ReactNode
}

const TOGGLES: ToggleDef[] = [
  {
    key: 'plan',
    label: 'Plan',
    description:
      'Run the planning pipeline: ask, research, analyze, draft, review until approved. Investigation only, no edits.',
    icon: <Map size={14} />
  },
  {
    key: 'research',
    label: 'Research',
    description:
      'Spawn research subagents and use web search to deeply investigate the question before answering.',
    icon: <Search size={14} />
  },
  {
    key: 'debug',
    label: 'Debug',
    description: 'Surface intermediate reasoning and tool traces alongside the answer.',
    icon: <Bug size={14} />
  }
]

const GITHUB_MODES_URL = 'https://github.com/search?q=claude%20code%20mode&type=repositories'

type Props = {
  conversationId: string | null
  disabled: boolean
  onSubmit: (content: string, modes: TurnMode[]) => void
  onCompress: () => Promise<void> | void
}

export default function Composer({
  conversationId,
  disabled,
  onSubmit,
  onCompress
}: Props): React.JSX.Element {
  const contextQuery = useContextWindow(conversationId)
  const [value, setValue] = useState('')
  const [modes, setModes] = useState<Record<ToggleKey, boolean>>({
    plan: false,
    research: false,
    debug: false
  })
  const [modesOpen, setModesOpen] = useState(false)
  const [compressing, setCompressing] = useState(false)
  const [compressError, setCompressError] = useState<string | null>(null)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!ref.current) return
    ref.current.style.height = 'auto'
    ref.current.style.height = `${Math.min(ref.current.scrollHeight, 220)}px`
  }, [value])

  const activeModes = TOGGLES.filter((t) => modes[t.key])

  const handleSubmit = (): void => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    const turnModes: TurnMode[] = activeModes.map((t) => t.key)
    onSubmit(trimmed, turnModes)
    setValue('')
  }

  const toggleMode = (key: ToggleKey): void => {
    setModes((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleAddFromGithub = (): void => {
    window.open(GITHUB_MODES_URL, '_blank', 'noopener,noreferrer')
  }

  const handleCompress = async (): Promise<void> => {
    if (compressing || disabled || !conversationId) return
    setCompressing(true)
    setCompressError(null)
    try {
      await onCompress()
      setModesOpen(false)
    } catch (error) {
      setCompressError(error instanceof Error ? error.message : 'compress_failed')
    } finally {
      setCompressing(false)
    }
  }

  const isPlanMode = modes.plan

  return (
    <div className="composer">
      <div className={`composer-shell ${isPlanMode ? 'plan-mode' : ''}`}>
        <textarea
          ref={ref}
          className="composer-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSubmit()
            }
          }}
          rows={1}
          placeholder={disabled ? 'Streaming…' : 'Ask Claude anything…'}
        />
        <div className="composer-row">
          <div className="composer-meta">
            <span
              className="chrome"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <CornerDownLeft size={12} /> Enter to send
            </span>
            <span className="chrome">·</span>
            <span className="chrome mono">{value.length} chars</span>
          </div>
          <div className="composer-actions">
            <ContextDisk
              usedTokens={contextQuery.data?.usedTokens}
              totalTokens={contextQuery.data?.totalTokens}
              systemTokens={contextQuery.data?.breakdown.systemTokens}
              messageTokens={contextQuery.data?.breakdown.messageTokens}
              toolTokens={contextQuery.data?.breakdown.toolTokens}
              fileTokens={contextQuery.data?.breakdown.fileTokens}
              model={contextQuery.data?.model}
              hasData={!!contextQuery.data && contextQuery.data.usedTokens > 0}
            />
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                gap: '6px'
              }}
            >
              <button
                type="button"
                className={`modes-trigger ${activeModes.length ? 'has-active' : ''}`}
                onClick={() => setModesOpen(true)}
                title="Open modes"
                aria-haspopup="dialog"
                aria-expanded={modesOpen}
              >
                <SlidersHorizontal size={12} />
                {activeModes.length === 0 ? (
                  <span className="modes-trigger-label">Modes</span>
                ) : (
                  <span className="modes-trigger-chips">
                    {activeModes.map((m) => (
                      <span key={m.key} className="modes-trigger-chip">
                        {m.icon}
                        {m.label}
                      </span>
                    ))}
                  </span>
                )}
              </button>
              <button
                type="button"
                className="send-btn"
                onClick={handleSubmit}
                disabled={disabled || !value.trim()}
                title="Send"
              >
                <ArrowRight size={12} />
                Send
              </button>
            </div>
          </div>
        </div>
      </div>

      <Modal
        open={modesOpen}
        onClose={() => (compressing ? undefined : setModesOpen(false))}
        title="Modes"
        footer={
          <button
            type="button"
            className="btn-secondary"
            onClick={handleAddFromGithub}
            title="Browse GitHub for mode presets"
          >
            <GitBranchPlus size={14} />
            Add from GitHub
          </button>
        }
      >
        <div className="modes-list list-card">
          {TOGGLES.map((mode) => {
            const checked = modes[mode.key]
            return (
              <label
                key={mode.key}
                className={`list-row selectable modes-row ${checked ? 'on' : ''}`}
              >
                <span className="glyph" aria-hidden="true">
                  {mode.icon}
                </span>
                <span>
                  <span className="name">{mode.label}</span>
                  <span className="desc">{mode.description}</span>
                </span>
                <span className="toggle">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleMode(mode.key)}
                  />
                  <span className="slider" />
                </span>
              </label>
            )
          })}
          <button
            type="button"
            className={`list-row selectable modes-row modes-action ${compressing ? 'busy' : ''}`}
            onClick={handleCompress}
            disabled={compressing || disabled || !conversationId}
            aria-busy={compressing}
          >
            <span className="glyph" aria-hidden="true">
              {compressing ? <Loader2 size={14} className="spin" /> : <Minimize2 size={14} />}
            </span>
            <span>
              <span className="name">Compress</span>
              <span className="desc">
                {compressError
                  ? `Failed: ${compressError}`
                  : 'Summarize prior turns now and start the next turn from a fresh session.'}
              </span>
            </span>
            <span className="modes-action-cta chrome">
              {compressing ? 'Compressing…' : 'Run'}
            </span>
          </button>
        </div>
      </Modal>
    </div>
  )
}

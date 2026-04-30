import React from 'react'

type Props = {
  usedTokens?: number
  totalTokens?: number
  systemTokens?: number
  messageTokens?: number
  toolTokens?: number
  fileTokens?: number
  model?: string
  hasData?: boolean
}

export default function ContextDisk({
  usedTokens = 0,
  totalTokens = 200000,
  systemTokens = 0,
  messageTokens = 0,
  toolTokens = 0,
  fileTokens = 0,
  model,
  hasData = false
}: Props): React.JSX.Element {
  const safeTotal = totalTokens > 0 ? totalTokens : 200000
  const p = Math.max(0, Math.min(100, (usedTokens / safeTotal) * 100))
  const C = 2 * Math.PI * 9

  let tierId = 't1'
  let tierLabel = 'Plenty of room'
  if (p >= 20 && p < 60) {
    tierId = 't2'
    tierLabel = 'Healthy'
  } else if (p >= 60 && p < 78) {
    tierId = 't3'
    tierLabel = 'Watch'
  } else if (p >= 78 && p < 93) {
    tierId = 't4'
    tierLabel = 'Pruning soon'
  } else if (p >= 93) {
    tierId = 't5'
    tierLabel = 'Auto-compact'
  }

  if (!hasData) {
    tierId = 't1'
    tierLabel = 'Idle'
  }

  const fmt = (n: number): string => n.toLocaleString('en-US')
  const remaining = Math.max(0, safeTotal - usedTokens)
  const ariaLabel = hasData
    ? `Context window usage: ${Math.round(p)} percent, ${fmt(remaining)} tokens left`
    : 'Context window usage: idle'

  return (
    <div className="ctx-disk" data-tier={tierId} tabIndex={0} aria-label={ariaLabel}>
      <span className="ctx-pct">{hasData ? `${Math.round(p)}%` : '--'}</span>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle className="ctx-track" cx="12" cy="12" r="9" fill="none" strokeWidth="2.5" />
        <circle
          className="ctx-fill"
          cx="12"
          cy="12"
          r="9"
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          transform="rotate(-90 12 12)"
          strokeDasharray="56.549"
          strokeDashoffset={C * (1 - p / 100)}
        />
      </svg>

      <div className="ctx-pop" role="tooltip">
        <div className="pop-head">
          <span className="pop-title">Context window</span>
          <span className="pop-tier">{tierLabel}</span>
        </div>
        {model && (
          <div className="chrome mono" style={{ fontSize: 11, marginBottom: 6 }}>
            {model}
          </div>
        )}
        <div className="pop-total">
          <span>{fmt(usedTokens)}</span>
          <span className="pop-of">
            / <span>{fmt(safeTotal)}</span> tokens
          </span>
        </div>
        <div className="pop-bar">
          <span style={{ width: `${p}%` }}></span>
        </div>
        <div className="pop-list">
          <span
            className="lbl"
            style={{ '--swatch': 'oklch(70% 0.04 260)' } as React.CSSProperties}
          >
            System prompt
          </span>
          <span className="val">{fmt(systemTokens)}</span>

          <span
            className="lbl"
            style={{ '--swatch': 'oklch(72% 0.06 240)' } as React.CSSProperties}
          >
            Messages
          </span>
          <span className="val">{fmt(messageTokens)}</span>

          <span
            className="lbl"
            style={{ '--swatch': 'oklch(74% 0.08 200)' } as React.CSSProperties}
          >
            Tools
          </span>
          <span className="val">{fmt(toolTokens)}</span>

          <span
            className="lbl"
            style={{ '--swatch': 'oklch(76% 0.10 160)' } as React.CSSProperties}
          >
            Files &amp; context
          </span>
          <span className="val">{fmt(fileTokens)}</span>
        </div>
        <div className="pop-foot">
          {hasData ? (
            <>
              <strong>{fmt(remaining)}</strong> tokens left &middot; auto-compacts at{' '}
              <strong>93%</strong>
            </>
          ) : (
            <>Send a message to populate the breakdown.</>
          )}
        </div>
      </div>
    </div>
  )
}

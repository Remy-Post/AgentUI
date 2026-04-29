import React from 'react'

type Props = {
  usedTokens?: number
  totalTokens?: number
  systemTokens?: number
  messageTokens?: number
  toolTokens?: number
  fileTokens?: number
}

export default function ContextDisk({
  usedTokens = 124000,
  totalTokens = 200000,
  systemTokens = 8420,
  messageTokens = 86300,
  toolTokens = 12100,
  fileTokens = 17180
}: Props): React.JSX.Element {
  const p = Math.max(0, Math.min(100, (usedTokens / totalTokens) * 100))
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

  const fmt = (n: number) => n.toLocaleString('en-US')

  return (
    <div className="ctx-disk" data-tier={tierId} tabIndex={0} aria-label="Context window usage">
      <span className="ctx-pct">{Math.round(p)}%</span>
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
        <div className="pop-total">
          <span>{fmt(usedTokens)}</span>
          <span className="pop-of">
            / <span>{fmt(totalTokens)}</span> tokens
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
          <strong>$0.62</strong> spent so far &middot; <strong>14</strong> messages in window
          &middot; auto-compacts at <strong>93%</strong>
        </div>
      </div>
    </div>
  )
}

import { Brain, Sparkles, Zap, type LucideIcon } from 'lucide-react'
import { useSettings } from '../../hooks/useSettings'
import type { ModelClass } from '@shared/types'

// Mirrors the server's MODELS map in agent-server/util/vars.ts. Renderer can't
// import runtime values from agent-server, so the latest IDs are duplicated
// here for display only — the server still resolves the actual model used.
const LATEST_MODEL_ID: Record<ModelClass, string> = {
  opus: 'claude-opus-4-7',
  sonnet: 'claude-sonnet-4-6',
  haiku: 'claude-haiku-4-5-20251001'
}

const OPTIONS: Array<{
  id: ModelClass
  name: string
  icon: LucideIcon
}> = [
  {
    id: 'opus',
    name: 'Opus',
    icon: Brain
  },
  {
    id: 'sonnet',
    name: 'Sonnet',
    icon: Sparkles
  },
  {
    id: 'haiku',
    name: 'Haiku',
    icon: Zap
  }
]

export default function ModelTab(): React.JSX.Element {
  const { data, update } = useSettings()
  const current: ModelClass = data?.defaultModel ?? 'sonnet'

  return (
    <div className="settings-pane">
      <div className="pane-head">
        <div className="pane-head-text">
          <div className="pane-title">Default model</div>
          <div className="pane-sub">
            Used when starting a new conversation. Picks the latest release in the chosen class.
            Existing conversations keep the model they were created with.
          </div>
        </div>
      </div>

      <div className="list-card">
        {OPTIONS.map((opt) => {
          const Icon = opt.icon
          const checked = current === opt.id
          const modelId =
            checked && data?.defaultModelId ? data.defaultModelId : LATEST_MODEL_ID[opt.id]
          return (
            <label key={opt.id} className="list-row selectable" style={{ cursor: 'pointer' }}>
              <div className="glyph">
                <Icon size={14} />
              </div>
              <div>
                <div className="name">
                  {opt.name} <span className="chrome mono">· {modelId}</span>
                </div>
              </div>
              <input
                type="radio"
                name="default-model"
                checked={checked}
                onChange={() => update({ defaultModel: opt.id })}
                style={{ accentColor: 'var(--color-ink)', width: 16, height: 16 }}
              />
            </label>
          )
        })}
      </div>
    </div>
  )
}

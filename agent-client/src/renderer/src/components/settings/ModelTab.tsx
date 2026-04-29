import { Cpu, Zap, Feather } from 'lucide-react'
import { useSettings } from '../../hooks/useSettings'
import type { SettingsDTO } from '@shared/types'

type Model = SettingsDTO['defaultModel']

const OPTIONS: Array<{ id: Model; name: string; description: string; icon: typeof Cpu }> = [
  {
    id: 'claude-sonnet-4',
    name: 'claude-sonnet-4',
    description: 'Balanced default. Great for most chat and coding work.',
    icon: Zap
  },
  {
    id: 'claude-opus-4',
    name: 'claude-opus-4',
    description: 'Deep reasoning, long horizons. Use for hard, multi-step tasks.',
    icon: Cpu
  },
  {
    id: 'claude-haiku-4-5',
    name: 'claude-haiku-4-5',
    description: 'Fast and cheap. Best for quick lookups and short replies.',
    icon: Feather
  }
]

export default function ModelTab(): React.JSX.Element {
  const { data, update } = useSettings()
  const current = data?.defaultModel ?? 'claude-sonnet-4'

  return (
    <div className="settings-pane">
      <div className="pane-head">
        <div className="pane-head-text">
          <div className="pane-title">Default model</div>
          <div className="pane-sub">
            Used when starting a new conversation. Existing conversations keep the model they were
            created with.
          </div>
        </div>
      </div>

      <div className="list-card">
        {OPTIONS.map((opt) => {
          const Icon = opt.icon
          const checked = current === opt.id
          return (
            <label key={opt.id} className="list-row selectable" style={{ cursor: 'pointer' }}>
              <div className="glyph">
                <Icon size={14} />
              </div>
              <div>
                <div className="name">{opt.name}</div>
                <div className="desc">{opt.description}</div>
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

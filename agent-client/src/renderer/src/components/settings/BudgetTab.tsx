import { Gauge, Zap, type LucideIcon } from 'lucide-react'
import { useSettings } from '../../hooks/useSettings'

type ToggleRowProps = {
  icon: LucideIcon
  name: string
  description: string
  checked: boolean
  onChange: (next: boolean) => void
}

function ToggleRow({
  icon: Icon,
  name,
  description,
  checked,
  onChange
}: ToggleRowProps): React.JSX.Element {
  return (
    <div className="list-row">
      <div className="glyph">
        <Icon size={14} />
      </div>
      <div>
        <div className="name">{name}</div>
        <div className="desc">{description}</div>
      </div>
      <label className="toggle" title={checked ? 'On' : 'Off'}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="slider" />
      </label>
    </div>
  )
}

export default function BudgetTab(): React.JSX.Element {
  const { data, update } = useSettings()
  const useOneMillionContext = data?.useOneMillionContext ?? false
  const useFastMode = data?.useFastMode ?? false

  return (
    <div className="settings-pane">
      <div className="pane-head">
        <div className="pane-head-text">
          <div className="pane-title">Budget</div>
          <div className="pane-sub">
            Cost-affecting toggles persisted globally. Each flag is sent to the
            SDK only on turns whose model actually supports it.
          </div>
        </div>
      </div>

      <div className="list-card">
        <ToggleRow
          icon={Gauge}
          name="1M context window"
          description="Enables 1M context for Sonnet. Higher cost above 200K input tokens."
          checked={useOneMillionContext}
          onChange={(next) => update({ useOneMillionContext: next })}
        />
        <ToggleRow
          icon={Zap}
          name="Fast mode"
          description="Enables fast mode for Opus. Faster outputs at a higher per-token rate."
          checked={useFastMode}
          onChange={(next) => update({ useFastMode: next })}
        />
      </div>
    </div>
  )
}

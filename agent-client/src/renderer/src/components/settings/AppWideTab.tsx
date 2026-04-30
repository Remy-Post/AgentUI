import { AlignLeft, FileText, type LucideIcon } from 'lucide-react'
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
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="slider" />
      </label>
    </div>
  )
}

export default function AppWideTab(): React.JSX.Element {
  const { data, update } = useSettings()
  const showAppText = data?.showAppText ?? true
  const showDescriptions = data?.showDescriptions ?? true

  return (
    <div className="settings-pane">
      <div className="pane-head">
        <div className="pane-head-text">
          <div className="pane-title">App-wide</div>
          <div className="pane-sub">
            Controls shared display density across navigation, settings, dropdowns, and modals.
          </div>
        </div>
      </div>

      <div className="list-card">
        <ToggleRow
          icon={AlignLeft}
          name="Text"
          description="Shows the current full text interface. Turn off for icon-first controls and compact repeated labels."
          checked={showAppText}
          onChange={(next) => update({ showAppText: next })}
        />
        <ToggleRow
          icon={FileText}
          name="Descriptions"
          description="Shows explanatory helper copy and descriptions throughout the app."
          checked={showDescriptions}
          onChange={(next) => update({ showDescriptions: next })}
        />
      </div>
    </div>
  )
}

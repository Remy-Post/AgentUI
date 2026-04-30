import { AlignLeft, Check, FileText, Palette, type LucideIcon } from 'lucide-react'
import { useSettings } from '../../hooks/useSettings'
import {
  CONVERSATION_COLORS,
  CONVERSATION_COLOR_KEYS
} from '../../lib/conversationColors'
import type { ConversationColor } from '@shared/types'

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
  const defaultChatColor = data?.defaultChatColor ?? null
  const setDefaultChatColor = (color: ConversationColor | null): void => {
    update({ defaultChatColor: color })
  }

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
        <div className="list-row app-color-row">
          <div className="glyph">
            <Palette size={14} />
          </div>
          <div>
            <div className="name">Default chat color</div>
            <div className="desc">
              Applies to newly created conversations. Existing conversations keep their current color.
            </div>
          </div>
          <div
            className="conv-color-row app-color-controls"
            role="group"
            aria-label="Default chat color"
          >
            <button
              type="button"
              className={`conv-swatch default ${defaultChatColor === null ? 'selected' : ''}`}
              aria-label="No default color"
              aria-pressed={defaultChatColor === null}
              title="Default (no color)"
              onClick={() => setDefaultChatColor(null)}
            >
              {defaultChatColor === null && <Check size={14} />}
            </button>
            {CONVERSATION_COLOR_KEYS.map((key) => {
              const palette = CONVERSATION_COLORS[key]
              const selected = defaultChatColor === key
              return (
                <button
                  type="button"
                  key={key}
                  className={`conv-swatch ${selected ? 'selected' : ''}`}
                  aria-label={`${key} default color`}
                  aria-pressed={selected}
                  title={key}
                  style={{
                    background: palette.input,
                    borderColor: palette.side
                  }}
                  onClick={() => setDefaultChatColor(key)}
                >
                  <span className="conv-swatch-dot" style={{ background: palette.side }} />
                  {selected && (
                    <span className="conv-swatch-check">
                      <Check size={12} />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

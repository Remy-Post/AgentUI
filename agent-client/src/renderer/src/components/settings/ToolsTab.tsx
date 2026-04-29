import { Wrench } from 'lucide-react'
import { useTools } from '../../hooks/useTools'

export default function ToolsTab(): React.JSX.Element {
  const { tools, isFallback, setEnabled } = useTools()
  const allowedCount = tools.filter((t) => t.enabled).length
  const total = tools.length
  const summary =
    total === 0
      ? '—'
      : allowedCount === total
        ? 'All allowed'
        : allowedCount === 0
          ? 'All denied'
          : `${allowedCount} of ${total} allowed`

  const allowAll = (): void => {
    tools.forEach((t) => {
      if (!t.enabled) setEnabled(t.id, true)
    })
  }
  const denyAll = (): void => {
    tools.forEach((t) => {
      if (t.enabled) setEnabled(t.id, false)
    })
  }

  return (
    <div className="settings-pane">
      <div className="pane-head">
        <div className="pane-head-text">
          <div className="pane-title">Tool registry</div>
          <div className="pane-sub">
            Toggle individual tools the SDK is allowed to call.{' '}
            {isFallback && (
              <span className="chrome">(fallback list — backend endpoint not yet available)</span>
            )}
          </div>
        </div>
        <div className="row-actions">
          <button type="button" className="btn-secondary" onClick={allowAll}>
            Allow all
          </button>
          <button type="button" className="btn-secondary" onClick={denyAll}>
            Deny all
          </button>
        </div>
      </div>

      <div className="list-card">
        {tools.map((t) => (
          <div key={t.id} className="list-row compact">
            <div className="glyph">
              <Wrench size={12} />
            </div>
            <div>
              <div className="name mono">{t.id}</div>
              <div className="desc">{t.description}</div>
            </div>
            <label className="toggle" title={t.enabled ? 'Allowed' : 'Denied'}>
              <input
                type="checkbox"
                checked={t.enabled}
                onChange={(e) => setEnabled(t.id, e.target.checked)}
              />
              <span className="slider" />
            </label>
          </div>
        ))}
        {tools.length === 0 && (
          <div className="list-row">
            <div />
            <div>
              <div className="desc">Loading tools…</div>
            </div>
            <div />
          </div>
        )}
      </div>

      <div className="chrome" style={{ marginTop: 12 }}>
        {summary}
      </div>
    </div>
  )
}

import { useServerStatus } from '../hooks/useServerStatus'

export default function StatusDot(): React.JSX.Element {
  const status = useServerStatus()
  const label = status === 'connected' ? 'connected' : status === 'checking' ? 'checking' : 'offline'
  const className = status === 'connected' ? 'status-dot' : 'status-dot disconnected'
  return <span className={className}>{label}</span>
}

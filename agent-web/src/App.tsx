import { useCallback, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import CommandPalette from './components/CommandPalette'
import ChatLayout from './components/layouts/ChatLayout'
import FinanceLayout from './components/layouts/FinanceLayout'
import LogsLayout from './components/layouts/LogsLayout'
import MemoryLayout from './components/layouts/MemoryLayout'
import SettingsLayout from './components/layouts/SettingsLayout'
import { apiFetch } from './lib/api'
import { cx } from './lib/classes'
import { CONVERSATION_COLORS } from './lib/conversationColors'
import {
  emitKeybindAction,
  findKeybindForEvent,
  isEditableTarget,
  settingsTabForKeybindAction,
  viewForKeybindAction,
  type KeybindActionId
} from './lib/keybinds'
import { useViewStore } from './store/view'
import { useBooleanConfig } from './hooks/useConfig'
import { useKeybinds } from './hooks/useKeybinds'
import { useServerConnection, type ServerStatus } from './hooks/useServerStatus'
import { useSettings } from './hooks/useSettings'
import type { ConversationDTO } from '@shared/types'

function connectionMessage(status: ServerStatus): string {
  if (status === 'server-unreachable') return 'Start agent-server or check VITE_AGENT_SERVER_URL.'
  if (status === 'db-down') return 'The server is reachable, but MongoDB is not connected.'
  if (status === 'sdk-not-ready') return 'The server is reachable, but the SDK is not ready.'
  return 'Checking the local server connection...'
}

function ConnectionScreen({
  status,
  origin,
  checking,
  onRetry
}: {
  status: ServerStatus
  origin: string | null
  checking: boolean
  onRetry: () => void
}): React.JSX.Element {
  const isError = status !== 'checking'
  return (
    <div
      className="flex h-full items-center justify-center text-sm"
      style={{ color: isError ? 'var(--color-error)' : 'var(--color-muted)' }}
    >
      <div style={{ display: 'grid', gap: 10, justifyItems: 'center', textAlign: 'center' }}>
        <div>{connectionMessage(status)}</div>
        {origin && (
          <div className="chrome">
            server <span className="mono">{origin}</span>
          </div>
        )}
        {isError && (
          <button type="button" className="btn-secondary" onClick={onRetry} disabled={checking}>
            {checking ? 'Checking...' : 'Retry connection'}
          </button>
        )}
      </div>
    </div>
  )
}

function App(): React.JSX.Element {
  const view = useViewStore((s) => s.view)
  const setView = useViewStore((s) => s.setView)
  const setSettingsTab = useViewStore((s) => s.setSettingsTab)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [paletteQuery, setPaletteQuery] = useState('')
  const connection = useServerConnection()
  const { toggle: toggleSidebar } = useBooleanConfig('sidebar.collapsed', false)
  const { toggle: toggleInspector } = useBooleanConfig('inspector.open', true)
  const { keybinds } = useKeybinds()
  const { data: appSettings, update: updateAppSettings } = useSettings({ enabled: connection.isReady })
  const queryClient = useQueryClient()

  const conversationsQuery = useQuery({
    queryKey: ['conversations'],
    queryFn: () => apiFetch<ConversationDTO[]>('/api/sessions'),
    enabled: connection.isReady
  })
  const createConversation = useMutation({
    mutationFn: () =>
      apiFetch<ConversationDTO>('/api/sessions', {
        method: 'POST',
        body: JSON.stringify({ title: 'New conversation' })
      }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] })
      setConversationId(created._id)
      setView('chat')
      setPaletteOpen(false)
      setPaletteQuery('')
    }
  })
  const activeConversation =
    conversationsQuery.data?.find((c) => c._id === conversationId) ?? null
  const mainTint =
    view === 'chat' && activeConversation?.color
      ? CONVERSATION_COLORS[activeConversation.color].main
      : null
  const rootStyle = mainTint
    ? ({ ['--main-tint' as string]: mainTint, height: '100%' } as React.CSSProperties)
    : ({ height: '100%' } as React.CSSProperties)

  const closePalette = (): void => {
    setPaletteOpen(false)
    setPaletteQuery('')
  }

  const selectConversation = (id: string): void => {
    setConversationId(id)
    setView('chat')
    closePalette()
  }

  const runKeybindAction = useCallback(
    (actionId: KeybindActionId): boolean => {
      if (isEditableTarget(document.activeElement)) return false
      if (!connection.isReady) return false

      switch (actionId) {
        case 'command.openPalette':
          setPaletteOpen(true)
          return true
        case 'app.toggleSidebar':
          toggleSidebar()
          return true
        case 'app.toggleTextLabels':
          updateAppSettings({ showAppText: !(appSettings?.showAppText ?? true) })
          return true
        case 'app.toggleDescriptions':
          updateAppSettings({ showDescriptions: !(appSettings?.showDescriptions ?? true) })
          return true
        case 'chat.newConversation':
          if (!createConversation.isPending) createConversation.mutate()
          return true
        case 'chat.toggleInspector':
          toggleInspector()
          return true
        default:
          break
      }

      const viewTarget = viewForKeybindAction(actionId)
      if (viewTarget) {
        setView(viewTarget)
        return true
      }

      const settingsTarget = settingsTabForKeybindAction(actionId)
      if (settingsTarget) {
        setSettingsTab(settingsTarget)
        setView('settings')
        return true
      }

      return emitKeybindAction(actionId)
    },
    [
      appSettings?.showAppText,
      appSettings?.showDescriptions,
      connection.isReady,
      createConversation,
      setSettingsTab,
      setView,
      toggleInspector,
      toggleSidebar,
      updateAppSettings
    ]
  )

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented) return

      const keybind = findKeybindForEvent(event, keybinds)
      if (!keybind) return

      if (runKeybindAction(keybind.actionId)) event.preventDefault()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [keybinds, runKeybindAction])

  useEffect(() => {
    const textMinimal = appSettings?.showAppText === false
    const descriptionsHidden = appSettings?.showDescriptions === false
    document.body.classList.toggle('text-minimal', textMinimal)
    document.body.classList.toggle('descriptions-hidden', descriptionsHidden)
    return () => {
      document.body.classList.remove('text-minimal', 'descriptions-hidden')
    }
  }, [appSettings?.showAppText, appSettings?.showDescriptions])

  if (!connection.isReady) {
    return (
      <ConnectionScreen
        status={connection.status}
        origin={connection.origin}
        checking={connection.isChecking}
        onRetry={connection.refetch}
      />
    )
  }

  const appRootClass = cx(
    'app-root',
    appSettings?.showAppText === false && 'text-minimal',
    appSettings?.showDescriptions === false && 'descriptions-hidden'
  )

  return (
    <div className={appRootClass} style={rootStyle}>
      {view === 'chat' && (
        <ChatLayout
          selectedConversationId={conversationId}
          onSelectConversation={selectConversation}
        />
      )}
      {view === 'finance' && <FinanceLayout />}
      {view === 'settings' && <SettingsLayout onSelectConversation={selectConversation} />}
      {view === 'logs' && <LogsLayout />}
      {view === 'memory' && <MemoryLayout />}
      {paletteOpen ? (
        <CommandPalette
          query={paletteQuery}
          selectedConversationId={conversationId}
          onClose={closePalette}
          onQueryChange={setPaletteQuery}
          onSelectConversation={selectConversation}
        />
      ) : null}
    </div>
  )
}

export default App

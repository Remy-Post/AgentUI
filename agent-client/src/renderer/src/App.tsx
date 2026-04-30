import { useCallback, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import CommandPalette from './components/CommandPalette'
import ChatLayout from './components/layouts/ChatLayout'
import FinanceLayout from './components/layouts/FinanceLayout'
import LogsLayout from './components/layouts/LogsLayout'
import MemoryLayout from './components/layouts/MemoryLayout'
import SettingsLayout from './components/layouts/SettingsLayout'
import { useAppContext } from './components/AppContext'
import { apiFetch, getServerOrigin } from './lib/api'
import { CONVERSATION_COLORS } from './lib/conversationColors'
import {
  findKeybindForEvent,
  settingsTabForKeybindAction,
  viewForKeybindAction,
  type KeybindActionId
} from './lib/keybinds'
import { useViewStore } from './store/view'
import { useConfig } from './hooks/useConfig'
import { useKeybinds } from './hooks/useKeybinds'
import type { ConversationDTO } from '@shared/types'

function App(): React.JSX.Element {
  const view = useViewStore((s) => s.view)
  const setView = useViewStore((s) => s.setView)
  const setSettingsTab = useViewStore((s) => s.setSettingsTab)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [paletteQuery, setPaletteQuery] = useState('')
  const { isLoading, setIsLoading } = useAppContext()
  const [serverError, setServerError] = useState(false)
  const inspectorConfig = useConfig<boolean>('inspector.open', true)
  const { keybinds } = useKeybinds()
  const queryClient = useQueryClient()

  const conversationsQuery = useQuery({
    queryKey: ['conversations'],
    queryFn: () => apiFetch<ConversationDTO[]>('/api/sessions'),
    enabled: !serverError && !isLoading
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
  // Only tint the main interface when it actually relates to the active
  // conversation. The chat view is the only view that operates on a specific
  // conversation; logs, memory, finance, and settings stand on their own.
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
    (actionId: KeybindActionId): void => {
      if (actionId === 'command.openPalette') {
        setPaletteOpen(true)
        return
      }

      if (actionId === 'chat.newConversation') {
        if (!createConversation.isPending) createConversation.mutate()
        return
      }

      if (actionId === 'inspector.toggle') {
        inspectorConfig.setValue(!inspectorConfig.value)
        return
      }

      const viewTarget = viewForKeybindAction(actionId)
      if (viewTarget) {
        setView(viewTarget)
        return
      }

      const settingsTarget = settingsTabForKeybindAction(actionId)
      if (settingsTarget) {
        setSettingsTab(settingsTarget)
        setView('settings')
      }
    },
    [createConversation, inspectorConfig, setSettingsTab, setView]
  )

  useEffect(() => {
    setIsLoading(true)
    getServerOrigin()
      .then((origin) => {
        if (!origin) setServerError(true)
        setIsLoading(false)
      })
      .catch(() => {
        setServerError(true)
        setIsLoading(false)
      })
  }, [setIsLoading])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented) return

      const keybind = findKeybindForEvent(event, keybinds)
      if (!keybind) return

      event.preventDefault()
      runKeybindAction(keybind.actionId)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [keybinds, runKeybindAction])

  if (isLoading) {
    return (
      <div
        className="flex h-full items-center justify-center text-sm"
        style={{ color: 'var(--color-muted)' }}
      >
        Connecting to server...
      </div>
    )
  }

  if (serverError) {
    return (
      <div
        className="flex h-full items-center justify-center text-sm"
        style={{ color: 'var(--color-error)' }}
      >
        Failed to connect to server. Restart the app.
      </div>
    )
  }

  return (
    <div className="app-root" style={rootStyle}>
      {view === 'chat' && (
        <ChatLayout
          selectedConversationId={conversationId}
          onSelectConversation={selectConversation}
        />
      )}
      {view === 'finance' && <FinanceLayout />}
      {view === 'settings' && (
        <SettingsLayout
          selectedConversationId={conversationId}
          onSelectConversation={selectConversation}
        />
      )}
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

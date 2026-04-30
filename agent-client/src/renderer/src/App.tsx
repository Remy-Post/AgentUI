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
  emitKeybindAction,
  findKeybindForEvent,
  isEditableTarget,
  reservedKeybindReason,
  settingsTabForKeybindAction,
  viewForKeybindAction,
  type KeybindActionId
} from './lib/keybinds'
import { useViewStore } from './store/view'
import { useConfig } from './hooks/useConfig'
import { useKeybinds } from './hooks/useKeybinds'
import { useSettings } from './hooks/useSettings'
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
  const sidebarConfig = useConfig<boolean>('sidebar.collapsed', false)
  const inspectorConfig = useConfig<boolean>('inspector.open', true)
  const { keybinds } = useKeybinds()
  const { data: appSettings, update: updateAppSettings } = useSettings()
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
  // Only apply conversation surface styling when the view actually relates to
  // the active conversation. Logs, memory, finance, and settings stand on their own.
  const conversationPalette =
    view === 'chat' && activeConversation?.color
      ? CONVERSATION_COLORS[activeConversation.color]
      : null
  const rootStyle = conversationPalette
      ? ({
        ['--main-tint' as string]: conversationPalette.main,
        ['--composer-tint' as string]: conversationPalette.input,
        ['--user-message-tint' as string]: conversationPalette.input,
        height: '100%'
      } as React.CSSProperties)
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

      if (actionId === 'command.openPalette') {
        setPaletteOpen(true)
        return true
      }

      if (actionId === 'app.toggleSidebar') {
        sidebarConfig.setValue(!sidebarConfig.value)
        return true
      }

      if (actionId === 'app.toggleTextLabels') {
        updateAppSettings({ showAppText: !(appSettings?.showAppText ?? true) })
        return true
      }

      if (actionId === 'app.toggleDescriptions') {
        updateAppSettings({ showDescriptions: !(appSettings?.showDescriptions ?? true) })
        return true
      }

      if (actionId === 'chat.newConversation') {
        if (!createConversation.isPending) createConversation.mutate()
        return true
      }

      if (actionId === 'chat.toggleInspector') {
        inspectorConfig.setValue(!inspectorConfig.value)
        return true
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
      createConversation,
      inspectorConfig,
      setSettingsTab,
      setView,
      sidebarConfig,
      updateAppSettings
    ]
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

      if (runKeybindAction(keybind.actionId)) event.preventDefault()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [keybinds, runKeybindAction])

  useEffect(() => {
    void window.api.setAppKeybinds(
      keybinds
        .filter(({ keys }) => !reservedKeybindReason(keys))
        .map(({ actionId, enabled, keys, label }) => ({ actionId, enabled, keys, label }))
    )
  }, [keybinds])

  useEffect(
    () =>
      window.api.onKeybindAction((actionId) => {
        runKeybindAction(actionId as KeybindActionId)
      }),
    [runKeybindAction]
  )

  useEffect(() => {
    const textMinimal = appSettings?.showAppText === false
    const descriptionsHidden = appSettings?.showDescriptions === false
    document.body.classList.toggle('text-minimal', textMinimal)
    document.body.classList.toggle('descriptions-hidden', descriptionsHidden)
    return () => {
      document.body.classList.remove('text-minimal', 'descriptions-hidden')
    }
  }, [appSettings?.showAppText, appSettings?.showDescriptions])

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

  const appRootClass = [
    'app-root',
    appSettings?.showAppText === false ? 'text-minimal' : '',
    appSettings?.showDescriptions === false ? 'descriptions-hidden' : ''
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={appRootClass} style={rootStyle}>
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

import { useEffect, useState } from 'react'
import CommandPalette from './components/CommandPalette'
import ChatLayout from './components/layouts/ChatLayout'
import FinanceLayout from './components/layouts/FinanceLayout'
import SettingsLayout from './components/layouts/SettingsLayout'
import { useAppContext } from './components/AppContext'
import { getServerOrigin } from './lib/api'
import { useViewStore } from './store/view'
import { useConfig } from './hooks/useConfig'

function App(): React.JSX.Element {
  const view = useViewStore((s) => s.view)
  const setView = useViewStore((s) => s.setView)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [paletteQuery, setPaletteQuery] = useState('')
  const { isLoading, setIsLoading } = useAppContext()
  const [serverError, setServerError] = useState(false)
  const inspectorConfig = useConfig<boolean>('inspector.open', true)

  const closePalette = (): void => {
    setPaletteOpen(false)
    setPaletteQuery('')
  }

  const selectConversation = (id: string): void => {
    setConversationId(id)
    setView('chat')
    closePalette()
  }

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

      const target = event.target as HTMLElement | null
      const tag = target?.tagName
      const inField =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target?.isContentEditable === true

      const isMeta = event.ctrlKey || event.metaKey
      const noMods = !event.altKey && !event.shiftKey

      if (isMeta && noMods && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen(true)
        return
      }

      if (isMeta && noMods && event.key === '.') {
        event.preventDefault()
        inspectorConfig.setValue(!inspectorConfig.value)
        return
      }

      if (!isMeta && !event.altKey && !event.shiftKey && !inField) {
        if (event.key === '1') {
          event.preventDefault()
          setView('chat')
          return
        }
        if (event.key === '2') {
          event.preventDefault()
          setView('finance')
          return
        }
        if (event.key === '3') {
          event.preventDefault()
          setView('settings')
          return
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setView, inspectorConfig])

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
    <>
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
      {paletteOpen ? (
        <CommandPalette
          query={paletteQuery}
          selectedConversationId={conversationId}
          onClose={closePalette}
          onQueryChange={setPaletteQuery}
          onSelectConversation={selectConversation}
        />
      ) : null}
    </>
  )
}

export default App

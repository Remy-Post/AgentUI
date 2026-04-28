import { useEffect, useState } from 'react'
import Sidebar from './components/Sidebar'
import ChatView from './components/ChatView'
import SettingsPanel from './components/SettingsPanel'
import CommandPalette from './components/CommandPalette'
import { useAppContext } from './components/AppContext'
import { getServerOrigin } from './lib/api'

type View = 'chat' | 'settings'

function App(): React.JSX.Element {
  const [view, setView] = useState<View>('chat')
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [paletteQuery, setPaletteQuery] = useState('')
  const { isLoading, setIsLoading } = useAppContext()
  const [serverError, setServerError] = useState(false)

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
    if (view !== 'chat') return

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented) return

      const isPaletteShortcut =
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === 'k'

      if (!isPaletteShortcut) return

      event.preventDefault()
      setPaletteOpen(true)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [view])

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-950 text-sm text-zinc-500">
        Connecting to server...
      </div>
    )
  }

  if (serverError) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-950 text-sm text-red-400">
        Failed to connect to server. Restart the app.
      </div>
    )
  }

  return (
    <div className="flex h-full w-full bg-zinc-950 text-zinc-100">
      <Sidebar
        selectedId={conversationId}
        onSelect={selectConversation}
        onOpenSettings={() => {
          closePalette()
          setView('settings')
        }}
      />
      <main className="min-w-0 flex-1">
        {view === 'settings' ? (
          <SettingsPanel onClose={() => setView('chat')} />
        ) : (
          <ChatView conversationId={conversationId} />
        )}
      </main>
      {view === 'chat' && paletteOpen ? (
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

import { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import ChatView from './components/ChatView'
import SettingsPanel from './components/SettingsPanel'
import { useAppContext } from './components/AppContext'
import { getServerOrigin } from './lib/api'

type View = 'chat' | 'settings'

function App(): React.JSX.Element {
  const [view, setView] = useState<View>('chat')
  const [conversationId, setConversationId] = useState<string | null>(null)
  const { isLoading, setIsLoading } = useAppContext()
  const [serverError, setServerError] = useState(false)

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

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-950 text-sm text-zinc-500">
        Connecting to server…
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
        onSelect={(id) => {
          setConversationId(id)
          setView('chat')
        }}
        onOpenSettings={() => setView('settings')}
      />
      <main className="flex-1 min-w-0">
        {view === 'settings' ? (
          <SettingsPanel onClose={() => setView('chat')} />
        ) : (
          <ChatView conversationId={conversationId} />
        )}
      </main>
    </div>
  )
}

export default App

import { useState } from 'react'
import Sidebar from './components/Sidebar'
import ChatView from './components/ChatView'
import SettingsPanel from './components/SettingsPanel'

type View = 'chat' | 'settings'

function App(): React.JSX.Element {
  const [view, setView] = useState<View>('chat')
  const [conversationId, setConversationId] = useState<string | null>(null)

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

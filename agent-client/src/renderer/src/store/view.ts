import { create } from 'zustand'

export type View = 'chat' | 'finance' | 'settings' | 'logs' | 'memory'
export type SettingsTab = 'api' | 'model' | 'budget' | 'subagents' | 'skills' | 'tools' | 'conversations'

type ViewState = {
  view: View
  settingsTab: SettingsTab
  setView: (view: View) => void
  setSettingsTab: (tab: SettingsTab) => void
}

export const useViewStore = create<ViewState>((set) => ({
  view: 'chat',
  settingsTab: 'api',
  setView: (view) => set({ view }),
  setSettingsTab: (settingsTab) => set({ settingsTab })
}))

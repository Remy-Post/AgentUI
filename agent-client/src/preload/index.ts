import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

type LogLevel = 'debug' | 'info' | 'warning' | 'error'
type ClientLogEntryDTO = {
  id: string
  source: 'renderer' | 'main'
  level: LogLevel
  message: string
  timestamp: string
  meta?: Record<string, unknown>
}
type ClientLogsDTO = {
  renderer: ClientLogEntryDTO[]
  main: ClientLogEntryDTO[]
}

const api = {
  getServerPort: (): Promise<number | null> => ipcRenderer.invoke('server:getPort'),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  setApiKey: (key: string): Promise<{ ok: true } | { ok: false; reason: string }> =>
    ipcRenderer.invoke('secrets:setApiKey', key),
  hasApiKey: (): Promise<boolean> => ipcRenderer.invoke('secrets:hasApiKey'),
  setGitHubToken: (token: string): Promise<{ ok: true } | { ok: false; reason: string }> =>
    ipcRenderer.invoke('secrets:setGitHubToken', token),
  hasGitHubToken: (): Promise<boolean> => ipcRenderer.invoke('secrets:hasGitHubToken'),
  getConfig: (key: string): Promise<unknown> => ipcRenderer.invoke('config:get', key),
  setConfig: (key: string, value: unknown): Promise<{ ok: true } | { ok: false; reason: string }> =>
    ipcRenderer.invoke('config:set', key, value),
  getClientLogs: (): Promise<ClientLogsDTO> => ipcRenderer.invoke('logs:getClientLogs')
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}

export type DesktopApi = typeof api

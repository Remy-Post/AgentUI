import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { ClientLogsDTO } from '../main/logs'
import type { KeybindMenuRecord } from '../main/keybind-menu'

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
  getClientLogs: (): Promise<ClientLogsDTO> => ipcRenderer.invoke('logs:getClientLogs'),
  setAppKeybinds: (records: KeybindMenuRecord[]): Promise<{ ok: true }> =>
    ipcRenderer.invoke('keybinds:setAppKeybinds', records),
  onKeybindAction: (callback: (actionId: string) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, actionId: string): void => callback(actionId)
    ipcRenderer.on('keybind:run', listener)
    return () => ipcRenderer.removeListener('keybind:run', listener)
  }
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

import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  getServerPort: (): Promise<number | null> => ipcRenderer.invoke('server:getPort'),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  setApiKey: (key: string): Promise<{ ok: true } | { ok: false; reason: string }> =>
    ipcRenderer.invoke('secrets:setApiKey', key),
  hasApiKey: (): Promise<boolean> => ipcRenderer.invoke('secrets:hasApiKey'),
  getConfig: (key: string): Promise<unknown> => ipcRenderer.invoke('config:get', key),
  setConfig: (key: string, value: unknown): Promise<{ ok: true } | { ok: false; reason: string }> =>
    ipcRenderer.invoke('config:set', key, value),
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

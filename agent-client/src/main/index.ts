import { app, shell, BrowserWindow, ipcMain, session } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import icon from '../../resources/icon.png?asset'
import { startServerProcess, stopServerProcess } from './server-process'
import { readSecrets, setApiKey, hasApiKey } from './secrets'
import { getConfig, setConfig } from './config'

let serverPort: number | null = null

function applyCSP(port: number): void {
  // Static <meta> CSP cannot reference a runtime-chosen port; rewrite headers
  // at the network layer so connect-src can include the actual server origin.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const policy = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data:",
      `connect-src 'self' http://127.0.0.1:${port} ws://127.0.0.1:${port}`,
    ].join('; ')
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [policy],
      },
    })
  })
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

ipcMain.handle('server:getPort', () => serverPort)
ipcMain.handle('app:getVersion', () => app.getVersion())
ipcMain.handle('secrets:setApiKey', async (_event, key: string) => setApiKey(key))
ipcMain.handle('secrets:hasApiKey', async () => hasApiKey())
ipcMain.handle('config:get', async (_event, key: string) => getConfig(key))
ipcMain.handle('config:set', async (_event, key: string, value: unknown) => setConfig(key, value))

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const stored = await readSecrets()
  try {
    serverPort = await startServerProcess({
      ANTHROPIC_API_KEY: stored.ANTHROPIC_API_KEY,
      MONGODB_URI: process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/agent-desk',
    })
    applyCSP(serverPort)
  } catch (error) {
    console.error('[main] server failed to start:', error)
    // Still open the window so the SettingsPanel can collect the API key.
    serverPort = null
  }

  createWindow()

  if (!is.dev) {
    autoUpdater.checkForUpdatesAndNotify()
  }

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  stopServerProcess()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

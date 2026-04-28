import { utilityProcess, type UtilityProcess } from 'electron'
import { is } from '@electron-toolkit/utils'
import { join } from 'path'

type ReadyMessage = { type: 'ready'; port: number }
type ErrorMessage = { type: 'error'; message: string }
type ServerMessage = ReadyMessage | ErrorMessage

let child: UtilityProcess | null = null
let cachedPort: number | null = null

const DEV_PORT = Number(process.env.AGENT_SERVER_PORT ?? 3001)

export async function startServerProcess(envOverrides: Record<string, string | undefined>): Promise<number> {
  if (is.dev) {
    cachedPort = DEV_PORT
    return DEV_PORT
  }

  if (cachedPort !== null && child) return cachedPort

  const serverPath = join(process.resourcesPath, 'server', 'src', 'server.js')
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries({ ...process.env, ...envOverrides })) {
    if (typeof v === 'string') env[k] = v
  }

  child = utilityProcess.fork(serverPath, [], {
    env,
    serviceName: 'agent-server',
    stdio: 'pipe',
  })

  child.stdout?.on('data', (data) => process.stdout.write(`[server] ${data}`))
  child.stderr?.on('data', (data) => process.stderr.write(`[server] ${data}`))

  return new Promise<number>((resolve, reject) => {
    if (!child) return reject(new Error('utility_process_not_started'))
    const onMessage = (msg: ServerMessage): void => {
      if (msg.type === 'ready') {
        cachedPort = msg.port
        resolve(msg.port)
      } else if (msg.type === 'error') {
        reject(new Error(msg.message))
      }
    }
    const onExit = (code: number): void => {
      if (cachedPort === null) reject(new Error(`server_exited_${code}`))
    }
    child.on('message', onMessage)
    child.on('exit', onExit)
  })
}

export function stopServerProcess(): void {
  if (!child) return
  try {
    child.postMessage({ type: 'shutdown' })
  } catch {
    // ignore
  }
  const c = child
  child = null
  cachedPort = null
  setTimeout(() => {
    try {
      c.kill()
    } catch {
      // already dead
    }
  }, 2000)
}

export function getServerPort(): number | null {
  return cachedPort
}

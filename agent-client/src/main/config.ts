import { app, safeStorage } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'

type ConfigBlob = Record<string, unknown>

let cache: ConfigBlob | null = null

function configPath(): string {
  return join(app.getPath('userData'), 'config.bin')
}

async function readConfig(): Promise<ConfigBlob> {
  if (cache) return cache
  if (!safeStorage.isEncryptionAvailable()) {
    cache = {}
    return cache
  }
  try {
    const buf = await fs.readFile(configPath())
    const json = safeStorage.decryptString(buf)
    const parsed = JSON.parse(json) as ConfigBlob
    cache = parsed
    return parsed
  } catch {
    cache = {}
    return cache
  }
}

async function writeConfig(
  next: ConfigBlob
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!safeStorage.isEncryptionAvailable()) {
    return { ok: false, reason: 'encryption_unavailable' }
  }
  try {
    const json = JSON.stringify(next)
    const enc = safeStorage.encryptString(json)
    await fs.writeFile(configPath(), enc)
    cache = next
    return { ok: true }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'write_failed'
    return { ok: false, reason }
  }
}

export async function getConfig(key: string): Promise<unknown> {
  const blob = await readConfig()
  const value = blob[key]
  return value === undefined ? null : value
}

export async function setConfig(
  key: string,
  value: unknown
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const current = await readConfig()
  return writeConfig({ ...current, [key]: value })
}

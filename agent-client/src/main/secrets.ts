import { app, safeStorage } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'

type SecretsBlob = {
  ANTHROPIC_API_KEY?: string
  GITHUB_TOKEN?: string
}

function secretsPath(): string {
  return join(app.getPath('userData'), 'secrets.bin')
}

export async function readSecrets(): Promise<SecretsBlob> {
  if (!safeStorage.isEncryptionAvailable()) return {}
  try {
    const buf = await fs.readFile(secretsPath())
    const json = safeStorage.decryptString(buf)
    return JSON.parse(json) as SecretsBlob
  } catch {
    return {}
  }
}

export async function writeSecrets(
  next: SecretsBlob
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!safeStorage.isEncryptionAvailable()) {
    return { ok: false, reason: 'encryption_unavailable' }
  }
  try {
    const json = JSON.stringify(next)
    const enc = safeStorage.encryptString(json)
    await fs.writeFile(secretsPath(), enc)
    return { ok: true }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'write_failed'
    return { ok: false, reason }
  }
}

export async function setApiKey(
  key: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const current = await readSecrets()
  return writeSecrets({ ...current, ANTHROPIC_API_KEY: key })
}

export async function hasApiKey(): Promise<boolean> {
  const current = await readSecrets()
  return Boolean(current.ANTHROPIC_API_KEY)
}

export async function setGitHubToken(
  token: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const current = await readSecrets()
  return writeSecrets({ ...current, GITHUB_TOKEN: token })
}

export async function hasGitHubToken(): Promise<boolean> {
  const current = await readSecrets()
  return Boolean(current.GITHUB_TOKEN)
}

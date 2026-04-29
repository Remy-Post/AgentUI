import * as path from 'path'
import { promises as fs } from 'fs'
import matter from 'gray-matter'
import { Subagent, type SubagentDoc } from '../db/models/Subagent.ts'
import { Skill, type SkillDoc } from '../db/models/Skill.ts'

function projectRoot(): string {
  return process.env.AGENT_SCAFFOLD_ROOT ?? process.cwd()
}

function subagentDir(): string {
  return path.join(projectRoot(), '.claude', 'agents')
}

function skillsDir(): string {
  return path.join(projectRoot(), '.claude', 'skills')
}

function buildSubagentMarkdown(doc: SubagentDoc): string {
  const front: Record<string, unknown> = {
    name: doc.name,
    description: doc.description,
  }
  if (doc.model) front.model = doc.model
  if (doc.effort) front.effort = doc.effort
  if (doc.permissionMode) front.permissionMode = doc.permissionMode
  if (Array.isArray(doc.tools) && doc.tools.length > 0) front.tools = doc.tools.join(', ')
  if (Array.isArray(doc.disallowedTools) && doc.disallowedTools.length > 0) {
    front.disallowedTools = doc.disallowedTools.join(', ')
  }
  if (Array.isArray(doc.mcpServices) && doc.mcpServices.length > 0) {
    front.mcpServices = doc.mcpServices.join(', ')
  }
  return matter.stringify(doc.prompt ?? '', front)
}

function buildSkillMarkdown(doc: SkillDoc): string {
  const front: Record<string, unknown> = {
    name: doc.name,
    description: doc.description,
  }
  if (Array.isArray(doc.allowedTools) && doc.allowedTools.length > 0) {
    front['allowed-tools'] = doc.allowedTools.join(' ')
  }
  if (doc.parameters && typeof doc.parameters === 'object') {
    front.parameters = doc.parameters
  }
  return matter.stringify(doc.body ?? '', front)
}

export async function writeSubagentFile(doc: SubagentDoc): Promise<void> {
  const dir = subagentDir()
  await fs.mkdir(dir, { recursive: true })
  const filePath = path.join(dir, `${doc.name}.md`)
  await fs.writeFile(filePath, buildSubagentMarkdown(doc), 'utf8')
}

export async function removeSubagentFile(name: string): Promise<void> {
  const filePath = path.join(subagentDir(), `${name}.md`)
  await fs.rm(filePath, { force: true })
}

export async function writeSkillFile(doc: SkillDoc): Promise<void> {
  const dir = path.join(skillsDir(), doc.name)
  await fs.mkdir(dir, { recursive: true })
  const filePath = path.join(dir, 'SKILL.md')
  await fs.writeFile(filePath, buildSkillMarkdown(doc), 'utf8')
}

export async function removeSkillFile(name: string): Promise<void> {
  const dir = path.join(skillsDir(), name)
  await fs.rm(dir, { recursive: true, force: true })
}

// Sync all enabled subagents and skills from Mongo to disk. Disabled or removed entries
// are left alone here; explicit remove* helpers handle deletion when CRUD endpoints fire.
// Avoids reading or touching files outside the names we manage so CLI-managed files in
// the same directory are unaffected.
export async function syncFromDb(): Promise<{ subagents: number; skills: number }> {
  const [subagents, skills] = await Promise.all([
    Subagent.find({ enabled: true }).lean(),
    Skill.find({ enabled: true }).lean(),
  ])

  await Promise.all([
    fs.mkdir(subagentDir(), { recursive: true }),
    fs.mkdir(skillsDir(), { recursive: true }),
  ])

  for (const doc of subagents) {
    await writeSubagentFile(doc as unknown as SubagentDoc)
  }
  for (const doc of skills) {
    await writeSkillFile(doc as unknown as SkillDoc)
  }
  return { subagents: subagents.length, skills: skills.length }
}

import * as path from 'path'
import { promises as fs } from 'fs'
import matter from 'gray-matter'

type Definition = Record<string, unknown>
type DefinitionMap = Record<string, Definition>

const NON_SERIALIZABLE_KEYS = new Set(['prompt', 'hooks', 'mcpServers'])

async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath)
        return true
    } catch {
        return false
    }
}

type Joiners = { tools?: string; allowedTools?: string }

function buildContent(name: string, source: Definition, joiners: Joiners): string {
    const frontmatter: Record<string, unknown> = { name }

    for (const [key, value] of Object.entries(source)) {
        if (NON_SERIALIZABLE_KEYS.has(key)) continue
        if (typeof value === 'function') continue
        frontmatter[key] = value
    }

    if (joiners.tools && Array.isArray(frontmatter.tools)) {
        frontmatter.tools = (frontmatter.tools as string[]).join(joiners.tools)
    }
    if (joiners.allowedTools && Array.isArray(frontmatter['allowed-tools'])) {
        frontmatter['allowed-tools'] = (frontmatter['allowed-tools'] as string[]).join(joiners.allowedTools)
    }

    const body = typeof source.prompt === 'string' ? source.prompt : ''
    return matter.stringify(body, frontmatter)
}

export async function ensureSubagentFiles(
    subagents: DefinitionMap,
    baseDir: string = process.cwd(),
): Promise<void> {
    const dir = path.join(baseDir, '.claude', 'agents')
    await fs.mkdir(dir, { recursive: true })

    for (const [name, source] of Object.entries(subagents)) {
        const filePath = path.join(dir, `${name}.md`)
        if (await fileExists(filePath)) continue

        const content = buildContent(name, source, { tools: ', ' })
        await fs.writeFile(filePath, content, 'utf8')
        console.log(`[init] wrote subagent ${filePath}`)
    }
}

export async function ensureSkillFiles(
    skills: DefinitionMap,
    baseDir: string = process.cwd(),
): Promise<void> {
    const root = path.join(baseDir, '.claude', 'skills')
    await fs.mkdir(root, { recursive: true })

    for (const [name, source] of Object.entries(skills)) {
        const skillDir = path.join(root, name)
        const filePath = path.join(skillDir, 'SKILL.md')
        if (await fileExists(filePath)) continue

        await fs.mkdir(skillDir, { recursive: true })
        const content = buildContent(name, source, { allowedTools: ' ' })
        await fs.writeFile(filePath, content, 'utf8')
        console.log(`[init] wrote skill ${filePath}`)
    }
}

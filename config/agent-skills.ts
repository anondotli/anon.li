import { createHash } from "node:crypto"
import { promises as fs } from "node:fs"
import path from "node:path"

import matter from "gray-matter"

export const AGENT_SKILLS_SCHEMA_URL = "https://schemas.agentskills.io/discovery/0.2.0/schema.json"
export const AGENT_SKILLS_CACHE_CONTROL = "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400"
export const AGENT_SKILLS_CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
} as const

const PUBLISHED_AGENT_SKILL_NAMES = ["anon-li"] as const
const AGENT_SKILL_NAME_PATTERN = /^(?!-)(?!.*--)[a-z0-9-]{1,64}(?<!-)$/
const agentSkillsRoot = path.join(process.cwd(), "content", "agent-skills")

type PublishedAgentSkillName = (typeof PUBLISHED_AGENT_SKILL_NAMES)[number]

type AgentSkillEntry = {
    description: string
    digest: string
    name: string
    type: "skill-md"
    url: string
}

type AgentSkillsIndexDocument = {
    $schema: string
    skills: AgentSkillEntry[]
}

type PublishedAgentSkill = {
    content: Buffer
    description: string
    name: PublishedAgentSkillName
}

function getSkillFilePath(name: PublishedAgentSkillName) {
    return path.join(agentSkillsRoot, name, "SKILL.md")
}

export function getPublishedAgentSkillPath(name: PublishedAgentSkillName) {
    return `/.well-known/agent-skills/${name}/SKILL.md`
}

function getSkillDigest(content: Buffer) {
    return `sha256:${createHash("sha256").update(content).digest("hex")}`
}

async function readPublishedAgentSkill(name: PublishedAgentSkillName): Promise<PublishedAgentSkill> {
    const content = await fs.readFile(getSkillFilePath(name))
    const { data } = matter(content.toString("utf8"))
    const frontmatterName = typeof data.name === "string" ? data.name.trim() : ""
    const description = typeof data.description === "string" ? data.description.trim() : ""

    if (frontmatterName !== name) {
        throw new Error(`Published agent skill ${name} must declare matching frontmatter name.`)
    }

    if (!AGENT_SKILL_NAME_PATTERN.test(frontmatterName)) {
        throw new Error(`Published agent skill ${name} has an invalid frontmatter name.`)
    }

    if (!description) {
        throw new Error(`Published agent skill ${name} must declare a description.`)
    }

    return {
        content,
        description,
        name,
    }
}

export async function getPublishedAgentSkill(name: string) {
    if (!PUBLISHED_AGENT_SKILL_NAMES.includes(name as PublishedAgentSkillName)) {
        return null
    }

    return readPublishedAgentSkill(name as PublishedAgentSkillName)
}

export async function getAgentSkillsIndexDocument(): Promise<AgentSkillsIndexDocument> {
    const skills = await Promise.all(PUBLISHED_AGENT_SKILL_NAMES.map(async (name) => {
        const publishedSkill = await readPublishedAgentSkill(name)

        return {
            name: publishedSkill.name,
            type: "skill-md",
            description: publishedSkill.description,
            url: getPublishedAgentSkillPath(publishedSkill.name),
            digest: getSkillDigest(publishedSkill.content),
        } satisfies AgentSkillEntry
    }))

    return {
        $schema: AGENT_SKILLS_SCHEMA_URL,
        skills,
    }
}

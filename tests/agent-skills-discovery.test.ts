/**
 * @vitest-environment node
 */
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"

import { describe, expect, it } from "vitest"

import {
    AGENT_SKILLS_CACHE_CONTROL,
    AGENT_SKILLS_SCHEMA_URL,
    getPublishedAgentSkillPath,
} from "@/config/agent-skills"

const skillFilePath = path.join(process.cwd(), "content", "agent-skills", "anon-li", "SKILL.md")

function getExpectedDigest(content: Buffer) {
    return `sha256:${createHash("sha256").update(content).digest("hex")}`
}

describe("agent skills discovery", () => {
    it("serves an RFC v0.2.0 discovery index with digests", async () => {
        const expectedContent = await readFile(skillFilePath)
        const { GET, HEAD, OPTIONS } = await import("@/app/.well-known/agent-skills/index.json/route")
        const response = await GET()

        expect(response.status).toBe(200)
        expect(response.headers.get("content-type")).toContain("application/json")
        expect(response.headers.get("cache-control")).toBe(AGENT_SKILLS_CACHE_CONTROL)
        expect(response.headers.get("access-control-allow-origin")).toBe("*")
        expect(response.headers.get("access-control-allow-methods")).toBe("GET, HEAD, OPTIONS")

        await expect(response.json()).resolves.toEqual({
            $schema: AGENT_SKILLS_SCHEMA_URL,
            skills: [
                {
                    name: "anon-li",
                    type: "skill-md",
                    description: "Manage anon.li email aliases, recipients, encrypted drop metadata, and end-to-end encrypted forms through the MCP server or REST API.",
                    url: getPublishedAgentSkillPath("anon-li"),
                    digest: getExpectedDigest(expectedContent),
                },
            ],
        })

        const headResponse = await HEAD()
        expect(headResponse.status).toBe(200)
        expect(headResponse.headers.get("content-type")).toBe("application/json; charset=utf-8")
        expect(headResponse.headers.get("cache-control")).toBe(AGENT_SKILLS_CACHE_CONTROL)

        const optionsResponse = OPTIONS()
        expect(optionsResponse.status).toBe(204)
        expect(optionsResponse.headers.get("access-control-allow-methods")).toBe("GET, HEAD, OPTIONS")
    })

    it("serves the published SKILL.md artifact with markdown content type", async () => {
        const expectedContent = await readFile(skillFilePath, "utf8")
        const { GET, HEAD } = await import("@/app/.well-known/agent-skills/[skill]/SKILL.md/route")

        const response = await GET(new Request("https://anon.li/.well-known/agent-skills/anon-li/SKILL.md"), {
            params: Promise.resolve({ skill: "anon-li" }),
        })

        expect(response.status).toBe(200)
        expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8")
        expect(response.headers.get("cache-control")).toBe(AGENT_SKILLS_CACHE_CONTROL)
        await expect(response.text()).resolves.toBe(expectedContent)

        const headResponse = await HEAD(new Request("https://anon.li/.well-known/agent-skills/anon-li/SKILL.md"), {
            params: Promise.resolve({ skill: "anon-li" }),
        })
        expect(headResponse.status).toBe(200)
        expect(headResponse.headers.get("content-type")).toBe("text/markdown; charset=utf-8")
    })

    it("returns 404 for unknown published skills", async () => {
        const { GET } = await import("@/app/.well-known/agent-skills/[skill]/SKILL.md/route")
        const response = await GET(new Request("https://anon.li/.well-known/agent-skills/unknown/SKILL.md"), {
            params: Promise.resolve({ skill: "unknown" }),
        })

        expect(response.status).toBe(404)
    })
})

import {
    AGENT_SKILLS_CACHE_CONTROL,
    AGENT_SKILLS_CORS_HEADERS,
    getAgentSkillsIndexDocument,
} from "@/config/agent-skills"

export const runtime = "nodejs"
export const revalidate = 3600

export async function GET() {
    return Response.json(await getAgentSkillsIndexDocument(), {
        headers: {
            ...AGENT_SKILLS_CORS_HEADERS,
            "Cache-Control": AGENT_SKILLS_CACHE_CONTROL,
        },
    })
}

export async function HEAD() {
    await getAgentSkillsIndexDocument()

    return new Response(null, {
        headers: {
            ...AGENT_SKILLS_CORS_HEADERS,
            "Cache-Control": AGENT_SKILLS_CACHE_CONTROL,
            "Content-Type": "application/json; charset=utf-8",
        },
    })
}

export function OPTIONS() {
    return new Response(null, {
        status: 204,
        headers: {
            ...AGENT_SKILLS_CORS_HEADERS,
            "Access-Control-Max-Age": "86400",
        },
    })
}

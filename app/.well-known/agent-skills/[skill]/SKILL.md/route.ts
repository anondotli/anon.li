import {
    AGENT_SKILLS_CACHE_CONTROL,
    AGENT_SKILLS_CORS_HEADERS,
    getPublishedAgentSkill,
} from "@/config/agent-skills"

export const runtime = "nodejs"
export const revalidate = 3600

type RouteContext = {
    params: Promise<{
        skill: string
    }>
}

async function resolveSkillResponse(skillName: string) {
    const publishedSkill = await getPublishedAgentSkill(skillName)

    if (!publishedSkill) {
        return new Response("Not Found", {
            status: 404,
            headers: {
                ...AGENT_SKILLS_CORS_HEADERS,
                "Cache-Control": AGENT_SKILLS_CACHE_CONTROL,
                "Content-Type": "text/plain; charset=utf-8",
            },
        })
    }

    return new Response(new Uint8Array(publishedSkill.content), {
        headers: {
            ...AGENT_SKILLS_CORS_HEADERS,
            "Cache-Control": AGENT_SKILLS_CACHE_CONTROL,
            "Content-Type": "text/markdown; charset=utf-8",
        },
    })
}

export async function GET(_request: Request, { params }: RouteContext) {
    const { skill } = await params
    return resolveSkillResponse(skill)
}

export async function HEAD(_request: Request, { params }: RouteContext) {
    const { skill } = await params
    const response = await resolveSkillResponse(skill)
    return new Response(null, {
        status: response.status,
        headers: response.headers,
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

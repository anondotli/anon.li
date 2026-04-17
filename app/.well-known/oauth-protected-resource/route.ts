import { auth } from "@/lib/auth"
import { oAuthProtectedResourceMetadata } from "better-auth/plugins"

export const dynamic = "force-dynamic"
export const GET = oAuthProtectedResourceMetadata(auth)

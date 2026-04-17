import { auth } from "@/lib/auth"
import { oAuthDiscoveryMetadata } from "better-auth/plugins"

export const dynamic = "force-dynamic"
export const GET = oAuthDiscoveryMetadata(auth)

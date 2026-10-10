import { describe, expect, it } from "vitest"
import { databaseSslOption } from "@/lib/database-ssl"

describe("databaseSslOption", () => {
    it.each([
        "postgresql://anonli:anonli@localhost:5432/anonli",
        "postgresql://anonli:anonli@127.0.0.1:5432/anonli",
        "postgresql://anonli:anonli@[::1]:5432/anonli",
        "postgresql://anonli:anonli@LOCALHOST/anonli",
    ])("connects to a loopback database without TLS: %s", (url) => {
        expect(databaseSslOption(url)).toBe(false)
    })

    it.each([
        "postgresql://user:pw@db.example.com:5432/app",
        "postgresql://user:pw@192.0.2.10:5432/app",
        "postgresql://user:pw@localhost.example.com/app",
        "not a url",
    ])("keeps TLS for anything else: %s", (url) => {
        expect(databaseSslOption(url)).toEqual({ rejectUnauthorized: false })
    })
})

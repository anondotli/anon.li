import { describe, expect, it } from "vitest"
import {
    sanitizeArchivePath,
    sanitizeDownloadFilename,
    uniqueArchivePath,
} from "@/lib/download-filename"
import { getUploadFilePath, prepareSelectedFiles } from "@/lib/drop-file-selection"

describe("Drop folder and filename handling", () => {
    it("retains a browser-provided relative folder path for encryption", () => {
        const file = new File(["data"], "report.pdf", { type: "application/pdf" })
        Object.defineProperty(file, "webkitRelativePath", { value: "client/final/report.pdf" })

        const [prepared] = prepareSelectedFiles([file])

        expect(prepared && getUploadFilePath(prepared)).toBe("client/final/report.pdf")
    })

    it("preserves safe folder structure in ZIP paths while blocking traversal", () => {
        expect(sanitizeArchivePath("client/final/report.pdf")).toBe("client/final/report.pdf")
        expect(sanitizeArchivePath("../../secret/report?.pdf")).toBe("secret/report_.pdf")
        expect(sanitizeDownloadFilename("client/final/report.pdf")).toBe("report.pdf")
    })

    it("does not overwrite duplicate archive entries", () => {
        const used = new Set<string>()

        expect(uniqueArchivePath("assets/logo.svg", used)).toBe("assets/logo.svg")
        expect(uniqueArchivePath("assets/logo.svg", used)).toBe("assets/logo (2).svg")
        expect(uniqueArchivePath("assets/logo.svg", used)).toBe("assets/logo (3).svg")
    })
})

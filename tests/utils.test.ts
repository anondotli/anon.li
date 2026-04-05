import { describe, it, expect } from 'vitest'
import {
    cn,
    generateRandomString,
    sanitizeEmailSubject,
    sanitizeFilename,
    sanitizeDomain,
    escapeHtml,
    formatBytes,
} from '@/lib/utils'

describe('cn', () => {
    it('should merge classes correctly', () => {
        expect(cn('bg-red-500', 'text-white')).toBe('bg-red-500 text-white')
        expect(cn('px-2 py-1', 'p-4')).toBe('p-4')
    })
})

describe('generateRandomString', () => {
    it('should generate a string of correct length', () => {
        expect(generateRandomString(10)).toHaveLength(10)
        expect(generateRandomString()).toHaveLength(6)
    })

    it('should consist of lowercase alphanumeric characters', () => {
        expect(generateRandomString(100)).toMatch(/^[a-z0-9]+$/)
    })

    it('should be random', () => {
        expect(generateRandomString(10)).not.toBe(generateRandomString(10))
    })
})

describe('sanitizeEmailSubject', () => {
    it('should remove newlines and carriage returns', () => {
        expect(sanitizeEmailSubject('Hello\r\nWorld')).toBe('Hello World')
        expect(sanitizeEmailSubject('Test\nSubject')).toBe('Test Subject')
    })

    it('should remove null bytes', () => {
        expect(sanitizeEmailSubject('Hello\0World')).toBe('HelloWorld')
    })

    it('should remove control characters', () => {
        expect(sanitizeEmailSubject('Test\x00\x1F\x7FSubject')).toBe('TestSubject')
    })

    it('should collapse multiple spaces', () => {
        expect(sanitizeEmailSubject('Hello    World')).toBe('Hello World')
    })

    it('should truncate long subjects', () => {
        const longSubject = 'a'.repeat(150)
        const result = sanitizeEmailSubject(longSubject)
        expect(result.length).toBeLessThanOrEqual(100)
        expect(result.endsWith('...')).toBe(true)
    })

    it('should respect custom max length', () => {
        const result = sanitizeEmailSubject('Hello World', 8)
        expect(result.length).toBeLessThanOrEqual(8)
    })
})

describe('sanitizeFilename', () => {
    it('should remove path traversal attempts', () => {
        expect(sanitizeFilename('../../../etc/passwd')).not.toContain('..')
    })

    it('should remove dangerous characters', () => {
        expect(sanitizeFilename('file<script>.exe')).toBe('file_script_.exe')
    })

    it('should handle null bytes and control characters', () => {
        expect(sanitizeFilename('file\0name.txt')).toBe('filename.txt')
    })

    it('should collapse multiple underscores', () => {
        expect(sanitizeFilename('file___name.txt')).toBe('file_name.txt')
    })

    it('should return "unnamed" for empty input', () => {
        expect(sanitizeFilename('')).toBe('unnamed')
        expect(sanitizeFilename('   ')).toBe('unnamed')
    })

    it('should truncate long filenames while preserving extension', () => {
        const longName = 'a'.repeat(300) + '.pdf'
        const result = sanitizeFilename(longName)
        expect(result.length).toBeLessThanOrEqual(255)
        expect(result.endsWith('.pdf')).toBe(true)
    })
})

describe('sanitizeDomain', () => {
    it('should lowercase the domain', () => {
        expect(sanitizeDomain('EXAMPLE.COM')).toBe('example.com')
    })

    it('should remove protocol', () => {
        expect(sanitizeDomain('https://example.com')).toBe('example.com')
        expect(sanitizeDomain('http://example.com')).toBe('example.com')
    })

    it('should remove path and query', () => {
        expect(sanitizeDomain('example.com/path?query=1')).toBe('example.com')
    })

    it('should remove port', () => {
        expect(sanitizeDomain('example.com:8080')).toBe('example.com')
    })

    it('should only allow valid domain characters', () => {
        // The sanitization removes < > but keeps the text inside
        expect(sanitizeDomain('exam<script>ple.com')).toBe('examscriptple.com')
    })

    it('should remove leading/trailing dots and hyphens', () => {
        expect(sanitizeDomain('.example.com.')).toBe('example.com')
        expect(sanitizeDomain('-example.com-')).toBe('example.com')
    })
})

describe('escapeHtml', () => {
    it('should escape HTML special characters', () => {
        expect(escapeHtml('<script>')).toBe('&lt;script&gt;')
        expect(escapeHtml('"test"')).toBe('&quot;test&quot;')
        expect(escapeHtml("it's")).toBe("it&#39;s")
        expect(escapeHtml('a & b')).toBe('a &amp; b')
    })

    it('should handle mixed content', () => {
        expect(escapeHtml('<div className="test">Hello & Goodbye</div>'))
            .toBe('&lt;div className=&quot;test&quot;&gt;Hello &amp; Goodbye&lt;/div&gt;')
    })
})

describe('formatBytes', () => {
    it('should format bytes correctly', () => {
        expect(formatBytes(0)).toBe('0 B')
        expect(formatBytes(1024)).toBe('1 KB')
        expect(formatBytes(1024 * 1024)).toBe('1 MB')
        expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB')
    })

    it('should handle bigint', () => {
        expect(formatBytes(BigInt(1024 * 1024))).toBe('1 MB')
    })

    it('should respect decimal places', () => {
        expect(formatBytes(1536, 1)).toBe('1.5 KB')
        expect(formatBytes(1536, 0)).toBe('2 KB')
    })
})

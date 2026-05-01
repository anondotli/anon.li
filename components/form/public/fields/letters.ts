// Map a 0-based option index to a Typeform-style letter prefix:
// 0 → A, 1 → B, ..., 25 → Z, 26 → AA, 27 → AB, ...
export function indexToLetter(index: number): string {
    if (index < 0) return ""
    let n = index
    let out = ""
    do {
        out = String.fromCharCode(65 + (n % 26)) + out
        n = Math.floor(n / 26) - 1
    } while (n >= 0)
    return out
}

// Inverse: a single letter (A-Z) → 0..25; multi-letter not supported via keyboard.
export function letterToIndex(letter: string): number | null {
    if (letter.length !== 1) return null
    const code = letter.toUpperCase().charCodeAt(0)
    if (code < 65 || code > 90) return null
    return code - 65
}

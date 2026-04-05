/**
 * Build a share URL for a drop.
 *
 * For password-protected drops (customKey=true), the encryption key must NOT
 * appear in the URL — recipients derive it from the password instead.
 */
export function buildDropShareUrl(
    origin: string,
    dropId: string,
    keyString: string | null,
    customKey: boolean,
): string {
    const base = `${origin}/d/${dropId}`;
    if (customKey || !keyString) return base;
    return `${base}#${keyString}`;
}

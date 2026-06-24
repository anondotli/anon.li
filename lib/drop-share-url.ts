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

/**
 * Build a per-recipient share URL: the access token rides in the query string
 * (`?r=`, server-visible) while the decryption key stays in the fragment
 * (`#`, server-blind). For password drops the key is omitted, as in
 * buildDropShareUrl.
 */
export function buildRecipientShareUrl(
    origin: string,
    dropId: string,
    token: string,
    keyString: string | null,
    customKey: boolean,
): string {
    const base = `${origin}/d/${dropId}?r=${encodeURIComponent(token)}`;
    if (customKey || !keyString) return base;
    return `${base}#${keyString}`;
}

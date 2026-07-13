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
 * Build a per-recipient share URL. Both the bearer access token and optional
 * decryption key stay in the fragment, which browsers never send to the
 * server. The client extracts the token and sends it only to the download
 * authorization endpoint. For password drops the key is omitted, as in
 * buildDropShareUrl.
 */
export function buildRecipientShareUrl(
    origin: string,
    dropId: string,
    token: string,
    keyString: string | null,
    customKey: boolean,
): string {
    const fragment = new URLSearchParams();
    if (!customKey && keyString) fragment.set("k", keyString);
    fragment.set("r", token);
    return `${origin}/d/${dropId}#${fragment.toString()}`;
}

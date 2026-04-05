# Mail Server: Trust Boundary Documentation

The anon.li mail server (Haraka-based) is a **separate verified subsystem** that runs outside this repository. This document describes the trust boundary between the Next.js application and the mail server, and what each component can and cannot see.

## Architecture

```
Sender → [MX: mail.anon.li (Haraka)] → [Internal API] → Recipient
```

The Haraka mail server:
- Receives inbound email via SMTP (port 25)
- Resolves alias → recipient(s) via internal API calls to this application
- Applies PGP encryption (if recipient has a public key configured)
- Forwards to the recipient's real email address
- Records stats (forwarded/blocked counts) via internal API

## What the Mail Server CAN See

During the forwarding process, the mail server has access to:

- **Sender address**: The `MAIL FROM` and `From:` header of incoming mail
- **Alias address**: The `RCPT TO` address used for routing
- **Recipient address**: The real forwarding destination (looked up via API)
- **Email content**: The full message body (headers, text, attachments) — **unencrypted in transit** through the server, unless PGP is enabled
- **Connection metadata**: Sender IP, HELO/EHLO identity, TLS status

## What the Mail Server CANNOT See (with PGP enabled)

When a recipient has PGP encryption configured:
- The mail server encrypts the email body with the recipient's public key **before forwarding**
- After encryption, the plaintext content is discarded from memory
- The mail server cannot decrypt the message (it only has the public key)

## Internal API Endpoints

The mail server authenticates to the Next.js app using a shared secret (`MAIL_API_SECRET`).

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/internal/aliases` | GET | Resolve alias → recipient(s) + PGP keys |
| `/api/internal/aliases` | PATCH | Record forwarding stats (fire-and-forget) |
| `/api/internal/dkim` | GET | Fetch DKIM signing keys for custom domains |
| `/api/internal/reply-token` | GET | Validate reply tokens for anonymous replies |

## Key Security Properties

1. **Forwarding rather than mailbox storage**: The mail server routes inbound mail to downstream recipients and does not provide hosted inbox storage, though delivery can still involve transient Haraka queueing and short-lived logs.
2. **SRS (Sender Rewriting Scheme)**: Return paths are rewritten using HMAC-signed SRS addresses with a ±3 day timestamp window.
3. **DKIM signing**: Outbound mail is signed with DKIM keys (fetched from the app's database with in-memory TTL caching).
4. **Reply tokens**: Anonymous replies use stateless encrypted tokens (AES-256-GCM, HKDF-SHA256) that are decoded cryptographically and validated for expiry. No database lookup is required.
5. **Tracking prevention**: Known tracking domains, 1x1 pixels, and common tracking parameters are stripped from forwarded HTML mail.

## Verification Status

The mail server's behavior is verified by:
- Its own public repository and deployment (separate from this codebase)
- The internal API contract defined in this repo (`/api/internal/*`)
- Integration testing between the two systems

**This web app repo alone does not prove mail server behavior.** The published companion mail-server repo does support claims about reply tokenization, PGP forwarding, SRS, DKIM handling, and tracking stripping. Claims about runtime retention or deployment fidelity still depend on infrastructure.

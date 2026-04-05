# Security Policy

As a privacy-first platform, we take security vulnerabilities very seriously. We appreciate the security research community and encourage responsible disclosure.

## Reporting a Vulnerability

If you discover a security vulnerability within anon.li, please send an email to **security@anon.li**.

- **Do not** open a GitHub issue for security vulnerabilities.
- Include a detailed description of the vulnerability, steps to reproduce, and the potential impact.
- We will acknowledge your email within **48 hours**.
- We will provide an estimated timeframe for addressing the vulnerability within **5 business days**.

## Coordinated Disclosure Timeline

- We ask that you give us **90 days** from the initial report to address the vulnerability before any public disclosure.
- If we have not addressed the issue within 90 days, you may disclose the vulnerability publicly.
- If we release a fix before the 90-day deadline, we will coordinate with you on a mutually agreed disclosure date.
- We will credit you in any public advisory (unless you prefer to remain anonymous).

## Safe Harbor

We support good-faith security research. We will not pursue legal action against researchers who:

- Make a good-faith effort to avoid privacy violations, destruction of data, and interruption or degradation of our services.
- Only interact with accounts you own or with explicit permission of the account holder.
- Do not exploit a vulnerability beyond what is necessary to confirm its existence.
- Report the vulnerability to us before disclosing it publicly.
- Do not use the vulnerability for personal gain (beyond reasonable bug bounty rewards, if applicable).

## Researcher Guidelines

When testing for vulnerabilities, please:

- **Do not** perform destructive testing (e.g., deleting data, flooding endpoints, or DoS attacks).
- **Do not** access, modify, or delete data belonging to other users.
- **Do not** use automated scanning tools at high volume against production systems.
- **Do not** test against accounts you do not own without explicit authorization.
- **Do** use the minimum access necessary to confirm a vulnerability.
- **Do** respect user privacy at all times.

## Scope

### In Scope

- The anon.li web application (`https://anon.li`)
- The public REST API (`/api/v1/`)
- The R2 storage configuration
- The client-side encryption logic (`lib/crypto.client.ts`)
- Authentication and session management
- Access control and authorization logic

### Out of Scope

- Third-party services we use (Stripe, Cloudflare, Resend, Cloudflare R2, Upstash) - report those to the respective vendors.
- Social engineering or phishing attacks against anon.li staff or users.
- Denial of Service (DoS/DDoS) attacks.
- Issues in dependencies that are not exploitable in our specific usage.
- Reports from automated scanners without a demonstrated proof of concept.
- Content policy violations (spam, abuse) - report these to abuse@anon.li instead.

## Severity Classification

We use the following severity levels to prioritize fixes:

| Severity | Description | Response Target |
|----------|-------------|-----------------|
| **Critical** | Remote code execution, authentication bypass, encryption key exposure, full database access | Fix within 24 hours |
| **High** | Privilege escalation, significant data exposure, CSRF on sensitive operations, download limit bypass | Fix within 7 days |
| **Medium** | Information disclosure (non-sensitive), rate limit bypass, missing security headers | Fix within 30 days |
| **Low** | Theoretical vulnerabilities, best-practice deviations with no demonstrated impact | Fix within 90 days |

## Contact

- **Security reports**: [security@anon.li](mailto:security@anon.li)
- **General inquiries**: [hi@anon.li](mailto:hi@anon.li)
- **Abuse reports**: [abuse@anon.li](mailto:abuse@anon.li)

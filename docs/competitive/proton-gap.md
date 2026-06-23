# anon.li vs Proton — Competitive Gap Analysis

> Internal roadmap document. Written 2026-06-23 as the analysis deliverable of the
> production-hardening pass. **No features were built in this pass** (intent:
> "code quality for now"); this is the backlog to pull future product work from.

## 1. Framing: what we actually compete with

anon.li is **not** a mailbox provider and should not be positioned against Proton
Mail's full inbox. Our Alias product is anonymous **forwarding** (aliases forward
to your real inbox; replies go out via SRS). So the honest competitive map is:

| anon.li product | Proton's nearest equivalent | Notes |
|---|---|---|
| **Alias** (forwarding) | Proton Pass aliases / SimpleLogin (Proton-owned) | Proton owns SimpleLogin — the strongest direct competitor. |
| **Drop** (E2EE file sharing) | Proton Drive sharing | Proton Drive is full cloud storage; Drop is share-first, zero-knowledge, no-account-needed. |
| **Form** (encrypted forms) | *(none)* | **Proton has no Forms product.** Pure differentiator. |
| **Orgs/Teams** (shared E2EE vault, seats, RBAC, audit) | Proton for Business | Proton's is a whole-suite offering; ours is scoped to these three products. |
| **MCP server / CLI / extension** | *(none)* | No Proton equivalent for the AI-agent control plane or CLI. |

Takeaway: we win on **focus + novel surfaces (Form, MCP, CLI)**; Proton wins on
**suite breadth, brand trust, audits, and native apps**. Don't chase the whole
suite — close the trust and platform gaps that block privacy-conscious switchers.

## 2. Trust & transparency parity (highest leverage, lowest build cost)

This is where Proton's moat is real and where we're closest to closing it cheaply.
We already have: `/security`, `/privacy`, `/sub-processors`, `/warrant-canary`,
`/faq`, AGPL-on-GitHub, a "Report a Vulnerability" path, and an honest security
page that admits hosted infra "needs to be trusted and audited on their own terms."

| Signal | Proton | anon.li today | Gap |
|---|---|---|---|
| Open-source clients | ✅ | ✅ (AGPL, full app) | **Even / ahead** |
| Independent third-party security audit (published) | ✅ | ❌ | **P0 gap** |
| Formal bug-bounty program (e.g. tiered, public scope) | ✅ | ⚠️ disclosure only | **P1 gap** |
| Transparency report (requests received) | ✅ | ⚠️ warrant canary only | **P1 gap** |
| Verifiable E2EE claims (documented threat model + crypto spec) | ✅ | ⚠️ partial | **P1 gap** |
| Swiss/EU jurisdiction story | ✅ | check & state explicitly | **P2 gap** |

## 3. Feature & platform gaps

| Capability | Proton | anon.li | Priority |
|---|---|---|---|
| Passkeys / WebAuthn login | ✅ (Pass) | ❌ (TOTP 2FA only) | **P1** |
| Native mobile apps (iOS/Android) | ✅ | ❌ (web + extension + CLI) | **P2** (expensive) |
| Custom domains for aliases | ✅ | ✅ | — |
| Catch-all / wildcard aliases | ✅ | verify & document | P2 |
| PGP encryption to recipient | ✅ | ✅ (openpgp) | — |
| Crypto payment option | ✅ | ✅ (NOWPayments) | — |
| Encrypted Forms | ❌ | ✅ | **Our moat** |
| AI-agent control plane (MCP) | ❌ | ✅ | **Our moat** |

## 4. Prioritized roadmap

**P0 — do first (trust-critical, unblocks switchers):**
- Commission and publish an **independent security audit** of the web app + mail
  stack + E2EE design. Link it prominently from `/security` and `/compare/proton`.
  This is the single highest-trust-per-dollar item and directly answers the
  caveat already on our own security page.

**P1 — near-term (credibility + table-stakes auth):**
- **Passkeys/WebAuthn** via the better-auth passkey plugin (we already run
  better-auth; this is incremental, not greenfield).
- Formalize a **bug-bounty** program (scope, tiers, hall of fame).
- Publish a **threat-model + crypto spec** doc (per-product: what's encrypted,
  what keys exist, what the server can/can't see) to make E2EE claims verifiable.
- Lightweight **transparency report** beyond the warrant canary.

**P2 — later (high cost or lower leverage):**
- Native mobile apps (or a polished installable PWA as a cheaper interim).
- Document catch-all aliases, jurisdiction, and data-residency explicitly.

## 5. Positioning recommendation

Lead with what Proton structurally can't match: **"the privacy toolkit Proton
doesn't have a Form for — zero-knowledge aliases, file drops, and encrypted forms,
with a CLI, an extension, and an MCP server."** Keep `/compare/proton` honest about
where Proton is ahead (suite, audits, mobile) — credibility converts the
privacy-literate audience we're targeting better than overclaiming.

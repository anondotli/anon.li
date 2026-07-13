# Competitive Landscape Summary

**Generated**: 2026-07-13  
**Your product**: anon.li Drop  
**Competitors profiled**: 1

## Side-by-Side Comparison

| Dimension | anon.li Drop | WeTransfer |
|---|---|---|
| Core position | Provider-blind encrypted transfer | Polished mainstream file delivery |
| Guest sending | Yes, limited | Sender verification/account required |
| Recipient account | No | No |
| Free allowance | 5 GB account bandwidth; 100 MB guest Drop | 3 GB or 10 transfers per rolling 30 days |
| Largest published transfer | 250 GB | 1 TB |
| Encryption model | Client-side AES-256-GCM; key stays with users | TLS in transit; AES-256 at rest |
| Free password control | No | Yes |
| File requests | Forms can receive encrypted attachments, but not yet a Drop-native request flow | Yes |
| Mobile apps | No dedicated Drop app | iOS and Android |
| Automation | REST API, CLI, MCP | Primarily product UI and team workflows |
| Key advantage | Provider cannot decrypt Drop content | Familiarity and workflow maturity |

## Positioning Map

**Axes**: provider-readable → provider-blind; simple transfer → workflow suite

```text
                              Workflow suite
                                    |
          WeTransfer                |
                                    |
Provider-readable ------------------+------------------ Provider-blind
                                    |
                                    |         anon.li Drop
                                    |
                              Simple transfer
```

## Key Takeaways

- Zero-knowledge encryption is anon.li's strongest defensible difference; avoid reducing WeTransfer's documented TLS/AES security to “no encryption.”
- WeTransfer currently beats anon.li on top transfer size, native mobile support, previews, requests, branding, post-send controls, and overall delivery polish.
- anon.li can beat the free workflow on anonymous sending, 5 GB account allowance, folder fidelity, privacy aliases, open implementation, and automation.
- Password protection is now free at WeTransfer, so anon.li should revisit making custom-password Drops a paid-only feature.
- Production reliability and bounded-memory downloads matter more than adding another marketing claim.

## Gaps and Opportunities

1. Make large transfers dependable across browser capabilities, with honest preflight and recovery.
2. Add a first-class encrypted file-request flow, potentially building on anon.li Form.
3. Improve mobile sharing and native share-target ergonomics before investing in a full native app.
4. Expose post-send recipient, expiry, and notification controls in one obvious transfer detail view.
5. Lead with provider-blind encryption and verifiable implementation—not generic “secure transfer” language.

# WeTransfer security model — research notes

Sources:

- https://wetransfer.com/help-center/security-privacy/platform-security
- https://wetransfer.com/help-center/security-privacy/file-handling-policy

Pulled: 2026-07-13  
Source pages updated: 2026-05-29

Paraphrased observations:

- WeTransfer documents TLS encryption during upload/download and AES-256 encryption at rest.
- It describes access through unique sender/recipient links and reports ISO/IEC 27001 certification plus GDPR/Dutch UAVG compliance.
- Its file-handling policy says staff may inspect selected transfers when a user explicitly grants data-processing permission, and content may be acted on for terms or moderation reasons.
- This is a conventional provider-managed encryption model, not a client-side zero-knowledge model in which the provider lacks the decryption key.

Interpretation: WeTransfer has meaningful operational security and compliance strengths. anon.li's defensible distinction is provider-blind client-side encryption, not the vague claim that WeTransfer is "unencrypted."

# Authentication & Recovery

## Signers

NIP-07, NIP-46, direct nsec (with ncryptsec auto-detection). NIP-49 encrypted storage with auto-migration.

## Account Recovery

For email + nsec-with-email users: 24-char segmented recovery key generated at signup or in profile settings, downloadable as `.txt`.

Flow: email-verification token → recovery key + new password → re-encrypted nsec.

- Tables: `account_recovery`, `account_recovery_tokens`, `recovery_email_verifications`.
- APIs under `pages/api/auth/`; UI: `RecoveryKeyModal`, `/auth/recover`, "Forgot password?" in `SignInModal`. Helpers in `utils/auth/recovery.ts`.
- Security: `crypto.randomBytes` RNG; PBKDF2 600k iterations (back-compat with 1k); per-route rate limiting; email verification required.

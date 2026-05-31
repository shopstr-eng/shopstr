---
name: Independent side-effects in submit handlers
description: Order-dashboard submit handlers must not let one side-effect's failure abort the others (email, Nostr publish, DB write).
---

# Independent side-effects in submit handlers

When a single handler performs several independent side-effects — sending a
transactional email, publishing an encrypted Nostr gift-wrap to relays, and
persisting a status to the DB — do NOT chain them with shared `await`s inside one
`try`. A throw/hang in an earlier `await` (relay publish, signer signing, key
decode) jumps to `catch` and silently skips everything after it.

**Why:** The buyer shipping-confirmation email was never attempted because it sat
_after_ `await sendGiftWrappedMessageEvent(...)` and the status-update signing in
`onShippingSubmit`. Relay/signer failures aborted the handler before the email
fetch, so SendGrid showed zero attempts and prod logs showed nothing.

**How to apply:**

- Fire the most important / user-facing effect (the email) FIRST, fire-and-forget.
- Wrap each remaining side-effect (gift-wrap publish, DB write) in its OWN
  try/catch so one failure can't cascade.
- Keep guards minimal: only require what THAT effect needs. The email path needs
  `selectedOrder` + `signer` (NIP-98 header); `nostr` is only for the relay
  publish, so guard `nostr` inside the gift-wrap block, not at the top.
- Move per-effect prep (e.g. `nip19.decode` of the random sender/receiver keys)
  inside the block that uses it, so its failure can't gate unrelated effects.
- Client fetches here are fire-and-forget; add real `.catch(console.error)` and
  server-side per-branch logging, because swallowed errors make this class of bug
  invisible in both browser and deployment logs.

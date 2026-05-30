---
name: Storefront deferred chat load
description: Why signed-in custom stall/domain pages must defer gift-wrapped message decryption off the initial render path, and how deferred chat writes must be guarded.
---

# Storefront deferred chat load

The storefront fast-path (and storefront-to-storefront refetch) for a signed-in
visitor must NOT block the initial render on fetching/decrypting the user's
gift-wrapped message history. That work is the slow part: it signs an HTTP proof
and then runs two `signer.decrypt` calls per kind-1059 wrap across the user's
whole history — for NIP-07/NIP-46 signers that's hundreds of sequential signer
round-trips, which makes a custom stall/domain page feel like it hangs.

**Rule:** keep storefront content (products, shop profile, profiles, reviews,
communities) on the awaited critical path; run the chat/message fetch _after the
page paints_ (scheduled via requestIdleCallback, setTimeout fallback). The chat
fetch lives in its own exported function separate from the main storefront fetch
so it can be scheduled independently.

**Why:** contexts update incrementally and the storefront UI gates only on shop
data, so deferring chats does not delay visible content; chat context `isLoading`
starting `true` and resolving later is fine because no storefront UI blocks on it.

**How to apply / gotchas:**

- Any deferred chat write MUST be guarded by a run token that is bumped both (a)
  every time a new deferred fetch is scheduled (covers rapid slug/shop changes)
  and (b) at the top of the main init effect (covers account switch / logout).
  Without this, a slow message fetch from a previous shop or a previous signed-in
  user can overwrite the chat context after the user has moved on — a correctness
  AND privacy bug.
- When the chat fetch is pulled out of the main storefront fetch, the chat-derived
  counterparty pubkeys are no longer auto-merged into the storefront profile
  fetch. The deferred chat path must itself fetch profiles for those
  counterparties (non-blocking) or shop owners see conversations with missing
  profile metadata.

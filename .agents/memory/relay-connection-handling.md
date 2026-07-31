---
name: Relay connection handling
description: Rules for NostrManager wrappers around nostr-tools SimplePool so one slow/dead relay never stalls the app
---

# Relay connection handling (NostrManager / SimplePool)

Rules:

- Never cache a `pool.ensureRelay()` promise for reuse — a rejected promise stays rejected forever, permanently breaking that relay for the session. Ask the pool fresh on every connect; `AbstractRelay.connect()` already dedupes in-flight attempts.
- Never `await` an all-relay connect (`Promise.all` over connects) before subscribing or publishing. nostr-tools' `subscribeMap()` and `pool.publish()` each connect per-relay independently and in parallel with a bounded `maxWaitForConnection` (3s default in v2.23.x). Any pre-await gates every relay on the slowest/dead one.
- Always pass a bounded `connectionTimeout` to `relay.connect()`/`ensureRelay()`. `{ timeout: undefined }` means _no_ timeout — the attempt rides the browser TCP timeout (~2–3 min).
- Aggregate fetch timeouts should resolve with partially collected events, not reject — otherwise events already received from healthy relays are discarded. In `utils/timeout.ts`, `abort()` fires listeners synchronously _before_ `reject()`, so resolving inside the abort listener wins.

**Why:** GitHub issue #578 — a single unreachable relay (relay.nostr.band) stalled marketplace load 2–3 minutes and permanently broke that relay for the session.

**How to apply:** Any change to relay connect/subscribe/publish flow in the frontend NostrManager or the shopstr-mcp copy — keep keepAlive fire-and-forget, keep connection timeouts bounded, keep fetch partial-result semantics.

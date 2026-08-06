# NIP-58 Profile Badge Hardening Design

## Goal

Make PR #601's profile badges interoperable with NIP-58/NIP-51, deterministic under NIP-01 replacement rules, resilient to partial relay responses, and safe against untrusted relay-hint amplification without delaying core profile loading.

## Protocol decisions

- A kind `10008` Profile Badges event is the canonical standard list. The deprecated kind `30008` event with `d=profile_badges` remains compatible.
- Only ordered consecutive `a`/`e` pairs are candidates. The client renders at most four pairs, which NIP-58 explicitly permits, so resolution also stops at four to bound work.
- Kind `10008` and kind `30009` replacements use the NIP-01 rule: newer `created_at` wins; equal timestamps choose the lexically lowest event id. The deprecated kind `30008` form participates as an equivalent profile list; kind `10008` is preferred only when timestamp and event id are identical.
- The award must be kind `8`, be authored by the definition issuer, contain exactly one `a` tag matching the definition address, and include the profile pubkey in a `p` tag.
- Relay hints are recommendations, not trust grants. Only valid `ws:` or `wss:` URLs without credentials are accepted. At most eight unique hinted relays are used per batch. Queries sent to a hinted relay contain only the award or definition references associated with that hint.
- Definition relay hints are read from the profile list's `a` tag and from the fetched award's `a` tag. Award hints are read from the paired `e` tag.
- A user does not need a kind `0` metadata event to display badges. A minimal in-memory profile record supports the existing npub/avatar fallback.

## Data flow

1. `fetchProfile` fetches and publishes core profile metadata, then returns without waiting for badges.
2. A shared badge hydration coordinator deduplicates background work by Nostr manager, relay set, and pubkey.
3. It fetches the latest profile badge lists from configured relays, caps each list to four usable references, then fetches awards and definitions from configured relays plus scoped validated hints.
4. Resolution returns badges together with whether the result is conclusive. Observed empty lists and fully evaluated invalid lists are conclusive empty results; missing referenced events are inconclusive.
5. Context updates replace badges only for conclusive results. Incomplete/time-limited responses preserve existing badges.
6. Failed or inconclusive hydration is retryable after a short backoff. Changing the relay set permits an immediate retry.

## Error and abuse handling

- Badge failures never reject or delay core profile loading.
- Unparseable and unsupported relay hints are ignored.
- Hint count and badge count are bounded before network requests are built.
- Hinted requests are scoped per reference to avoid leaking the full batch to unrelated relays.
- Existing badges remain visible during transient failures.

## Verification

Regression tests cover deterministic replacement selection, conclusive versus retryable results, scoped relay hints, non-blocking profile loading, race-safe context updates, and badge display without kind `0` metadata. Full Jest, TypeScript, ESLint, Prettier, production-build, and browser smoke checks are required before merge.

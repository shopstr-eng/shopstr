# NIP-50 Relay Evaluation for Shopstr

## Overview

This document evaluates the configured default relays in Shopstr for NIP-50 (Search Capability) support, assessing which are suitable candidates for server-side search integration.

## Current Default Relays

The default relays are defined in `utils/nostr/nostr-helper-functions.ts` → `getDefaultRelays()`:

| Relay | NIP-50 Support | Notes |
|-------|---------------|-------|
| `wss://relay.damus.io` | ❌ No | General-purpose relay. Does not advertise NIP-50 support in its NIP-11 info document. |
| `wss://nos.lol` | ❌ No | General-purpose relay. No search capability advertised. |
| `wss://purplepag.es` | ❌ No | Specialized relay for profile metadata (kind 0, kind 10002). Not a general search relay. |
| `wss://relay.primal.net` | ❌ No | Primal's relay. Handles custom caching but does not expose NIP-50 search filters. |
| `wss://relay.nostr.band` | ✅ Yes | **Best candidate.** Indexes all public events and supports NIP-50 `search` filter fields. Well-known search relay in the Nostr ecosystem. |

Additionally, `wss://sendit.nosflare.com` is added as a write relay (via the `withBlastr` helper) but does not support NIP-50.

## Recommended NIP-50 Candidate

**`wss://relay.nostr.band`** is the primary candidate for NIP-50 testing and integration. It:
- Explicitly advertises NIP-50 in its NIP-11 info document
- Indexes kind 30402 (classified listings) events, which is the event kind Shopstr uses for product listings
- Supports the `search` filter field as defined by NIP-50

### Other Known NIP-50 Relays (Not Currently Configured) (https://nostr.watch/)

| Relay | Notes |
|-------|-------|
| `wss://search.nos.today` | Dedicated search relay. Could be added as an optional search-only relay. |
| `wss://cfrelay.royalgarter.workers.dev/` | Supports NIP-50 search. Less commonly used. |

## Server-Side vs. Client-Side Search: Key Differences

Understanding the behavioral differences between NIP-50 server-side search and Shopstr's current client-side filtering is critical for integration:

### Current Client-Side Behavior (Shopstr Today)
Shopstr currently loads **all** product events into memory and filters them using JavaScript regex matching in `display-products.tsx` (now extracted to `utils/parsers/search-predicate.ts`). This means:

- **Substring matching**: Searching for "app" will match "apple", "application", "app store", etc.
- **Case-insensitive**: All matching is case-insensitive via the `gi` regex flags.
- **Immediate**: Filtering happens instantly with no network round-trip since all data is already loaded.
- **Complete coverage**: Every loaded product is evaluated.

### NIP-50 Server-Side Behavior
When using a NIP-50 relay, the search query is sent as a filter parameter and the relay decides how to interpret it:

- **Word-boundary matching**: Many NIP-50 relays treat queries as whole words. Searching for "app" may **not** return "apple" or "application" — only events containing the exact word "app".
- **Relay-specific behavior**: The NIP-50 specification does not mandate exact matching semantics. Different relays may implement prefix matching, stemming, or exact word matching differently.
- **Network dependent**: Results require a relay round-trip, introducing latency.
- **Potentially broader**: Server-side search can return events not yet cached locally, enabling discovery of new listings.

### Practical Implications for Integration

1. **Deduplication**: When merging NIP-50 relay results with locally cached products, deduplication is critical. The existing `getEventKey()` pattern in `fetch-service.ts` (using `pubkey:dTag` for kind 30402 events) should be reused.
2. **Result differences**: Users may see different results depending on whether the search hits the local cache or a remote relay. The UI should ideally merge both and present a unified, deduplicated view.
3. **Fallback strategy**: If a NIP-50 relay is unavailable or returns no results, the system should fall back to the existing client-side predicate filter seamlessly.

## Recommendation

For the initial NIP-50 integration:
1. Add `wss://relay.nostr.band` as the designated search relay (it is already in the default list).
2. When a user types a search query, send a NIP-50 filter (`{ kinds: [30402], search: "<query>" }`) to this relay.
3. Merge the results with locally cached products using the existing deduplication logic.
4. Fall back to the client-side `productSatisfiesSearchFilter` if the relay query fails or times out.

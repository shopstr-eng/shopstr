# Shopstr Codebase Audit Report

> Full scan of the codebase for architectural issues, anti-patterns, code duplication, and improvement opportunities.

---

## 1. Database: Parameterized Replaceable Events Not Handled

**Severity: 🔴 Critical — Silent Data Corruption**

**Files:** [db-service.ts](file:///home/aryan/Desktop/shopstr/shopstr/utils/db/db-service.ts)

**The Problem:**
In Nostr, events in the `30000–39999` kind range are **Parameterized Replaceable Events** (NIP-01). Their uniqueness is defined by the triplet: `kind + pubkey + d-tag`. When a merchant edits a product, a brand new event `id` is created — but the old version should be *replaced*, not *kept*.

Currently, `kind: 30402` products fall into the `else` branch (line ~445) which does:
```sql
INSERT INTO product_events ... ON CONFLICT (id) DO UPDATE SET ...
```
Since every edit creates a new `id`, there is **never a conflict**. The database silently accumulates every historical version of every product forever.

**The Fix:**
For `kind >= 30000 && kind < 40000`, do what `shouldKeepOnlyLatest` does but keyed on `pubkey + kind + d-tag`:
```sql
DELETE FROM table WHERE pubkey = $1 AND kind = $2 
  AND tags::text LIKE '%"d","<d-tag>"%' AND created_at < $3
```
Then insert the new event. The frontend already compensates via `getEventKey()` in `fetchAllPosts`, but the DB will bloat indefinitely without this fix.

---

## 2. The `new Promise(async ...)` Anti-Pattern

**Severity: 🟡 Medium — Swallowed Errors & Debugging Nightmares**

**Files:** [fetch-service.ts](file:///home/aryan/Desktop/shopstr/shopstr/utils/nostr/fetch-service.ts) (13 occurrences)

**The Problem:**
Almost every fetch function wraps its body in `new Promise(async function (resolve, reject) { ... })`. This is a well-known JavaScript anti-pattern called the **"Explicit Promise Constructor"**. Since `async` functions already return a Promise, wrapping them in another Promise is redundant — and dangerous.

If an `await` inside the constructor throws before hitting the `try/catch`, the error is **silently swallowed** instead of propagating. The outer Promise never resolves or rejects — it just hangs.

```typescript
// ❌ Current (13 places)
export const fetchAllPosts = async (...) => {
  return new Promise(async function (resolve, reject) {
    try { ... resolve(data); }
    catch (error) { reject(error); }
  });
};

// ✅ Correct
export const fetchAllPosts = async (...) => {
  // ... just use await directly, return the result
  return data;
};
```

**Affected Functions (all in `fetch-service.ts`):**

| Line | Function |
|------|----------|
| 50 | `fetchAllPosts` |
| 160 | `fetchCart` |
| 247 | `fetchShopProfile` |
| 373 | `fetchProfile` |
| 491 | `fetchGiftWrappedChatsAndMessages` |
| 667 | `fetchReviews` (approx) |
| 945 | `fetchReports` |
| 1134 | `fetchAllRelays` |
| 1277 | `fetchAllBlossomServers` |
| 1380 | `fetchCashuWallet` |
| 1805 | `fetchAllCommunities` |
| 1872 | `fetchCommunityPosts` |
| 1994 | `fetchCommunityApprovals` |

---

## 3. Massive Code Duplication: Invoice Cards

**Severity: 🟡 Medium — Maintenance Nightmare**

**Files:**
- [cart-invoice-card.tsx](file:///home/aryan/Desktop/shopstr/shopstr/components/cart-invoice-card.tsx) — **3,195 lines**
- [product-invoice-card.tsx](file:///home/aryan/Desktop/shopstr/shopstr/components/product-invoice-card.tsx) — **2,470 lines**

**The Problem:**
These two files contain nearly identical logic for:
- `sendPaymentAndContactMessage()` — duplicated verbatim in both files
- `sendPaymentAndContactMessageWithKeys()` — duplicated verbatim
- `generateNewKeys()` — duplicated verbatim
- `validatePaymentData()` — duplicated verbatim
- Lightning invoice generation, Cashu payment, NWC payment — all duplicated
- Gift-wrapped DM construction (NIP-44/59) — duplicated with 8 `nip19.decode` calls each

Combined, these two files are **5,665 lines** — roughly **25% of the entire codebase's component layer**. Any bug fix in one must be manually replicated in the other.

**The Fix:**
Extract shared logic into a `utils/payments/payment-service.ts` module:
- `sendGiftWrappedPaymentMessage()`
- `generateLightningInvoice()`
- `processCashuPayment()`
- `processNWCPayment()`

Then both invoice cards become thin UI wrappers that call these shared functions.

---

## 4. Duplicate Caching in `fetchAllPosts`

**Severity: 🟢 Low — Wasted Network/DB Bandwidth**

**File:** [fetch-service.ts](file:///home/aryan/Desktop/shopstr/shopstr/utils/nostr/fetch-service.ts#L90-L139)

**The Problem:**
`fetchAllPosts()` calls `cacheEventsToDatabase()` **twice** on the same `fetchedEvents` array:

```
Line 94:  cacheEventsToDatabase(validProductEvents)   // first time
Line 136: cacheEventsToDatabase(validProducts)         // second time, same data!
```

Both filter from the same `fetchedEvents` array. The second call at line 136 is a strict superset (no kind filter). This means every relay-fetched product hits the DB API endpoint twice, doubling the POST requests.

**The Fix:** Remove the first caching block (lines 90–98) and keep only the second one at line 131.

---

## 5. God File: `nostr-helper-functions.ts`

**Severity: 🟡 Medium — Poor Cohesion, Hard to Navigate**

**File:** [nostr-helper-functions.ts](file:///home/aryan/Desktop/shopstr/shopstr/utils/nostr/nostr-helper-functions.ts) — **1,612 lines**

**The Problem:**
This single file contains completely unrelated responsibilities:
- Key generation (`generateKeys`)
- Event deletion (`deleteEvent`)
- Bunker token parsing (`parseBunkerToken`)
- Profile publishing (`UpdateProfile`)
- Product listing (`PostListing`)
- Saved-for-later / Cart logic (`publishSavedForLaterEvent`)
- Wallet events (`publishWalletEvent`)
- Gift-wrapped messaging (NIP-44/59)
- Community posting (`postToCommunity`, `approveCommunityPost`)
- Blossom image upload (`blossomUploadImages`)
- NIP-05 verification (`verifyNip05Identifier`)
- LocalStorage read/write (`getLocalStorageData`, `setLocalStorageData`)
- Relay helpers (`getDefaultRelays`, `withBlastr`)
- NWC string saving (`saveNWCString`)

**The Fix:** Split into focused modules:
- `utils/nostr/keys.ts` — key generation, encoding
- `utils/nostr/events.ts` — event creation, deletion, signing
- `utils/nostr/messaging.ts` — gift-wrapped DMs
- `utils/nostr/communities.ts` — community posting/approval
- `utils/nostr/blossom.ts` — image upload
- `utils/nostr/nip05.ts` — identity verification
- `utils/storage/local-storage.ts` — localStorage management

---

## 6. Unprotected API Routes

**Severity: 🟠 High — Security Risk**

**Files:** All files in [pages/api/db/](file:///home/aryan/Desktop/shopstr/shopstr/pages/api/db)

**The Problem:**
Every database API route (20 endpoints) has **zero authentication**. Anyone on the internet can:
- `POST /api/db/cache-events` — inject arbitrary events into the DB
- `POST /api/db/delete-events` — delete any cached events
- `GET /api/db/fetch-products` — dump the entire product cache
- `POST /api/db/update-order-status` — modify order statuses
- `POST /api/db/discount-codes` — create/modify discount codes

Since these are Next.js API routes, they're publicly accessible in production.

**The Fix:**
- For write endpoints: require a signed Nostr event or API key in the request header
- For read endpoints: consider rate limiting
- For sensitive endpoints (order status, discount codes): require Nostr auth (NIP-98)

---

## 7. `localStorage` as a State Management Crutch

**Severity: 🟡 Medium — SSR Incompatibility & Race Conditions**

**File:** [nostr-helper-functions.ts](file:///home/aryan/Desktop/shopstr/shopstr/utils/nostr/nostr-helper-functions.ts#L1312-L1480)

**The Problem:**
`getLocalStorageData()` is called from **50+ locations** across the codebase, including inside `finalizeAndSendNostrEvent()` (the core signing function). This means:

1. **SSR breaks:** `localStorage` doesn't exist on the server. Every call needs a `typeof window !== 'undefined'` guard.
2. **No reactivity:** When relay lists change, components that already called `getLocalStorageData()` in their render won't re-render.
3. **Race conditions:** Multiple components reading and writing `localStorage.setItem("tokens", ...)` can stomp on each other during concurrent Cashu operations.

The function reads **18 different keys** from localStorage on every single call — it's essentially doing a full "database scan" of the browser storage on every invocation.

**The Fix:**
Migrate to a proper React Context (`RelayConfigContext`, `WalletContext`) that wraps `localStorage` reads into a single source of truth with proper React state updates.

---

## 8. Silent Error Swallowing

**Severity: 🟡 Medium — Invisible Failures**

**Files:** Multiple across the codebase

**The Problem:**
There are **18 empty `catch {}` blocks** across the codebase that silently swallow errors:

| File | Count |
|------|-------|
| `nostr-helper-functions.ts` | 8 |
| `search-predicate.ts` | 3 |
| `db-service.ts` | 1 |
| `images.ts` | 1 |
| `encryption-migration.ts` | 1 |
| `auth.ts` | 2 |
| Other | 2 |

Example from `publishSavedForLaterEvent` (line 663):
```typescript
  } catch {
    return;  // Cart save failed? User will never know.
  }
```

When a user adds an item to their cart and it silently fails, they'll think it was saved. When they come back later, the cart is empty.

**The Fix:** At minimum, add `console.error` to every catch block. For user-facing operations (cart, payments), propagate the error so the UI can show a toast.

---

## 9. Duplicated `getEventKey` Logic

**Severity: 🟢 Low — DRY Violation**

**Files:**
- [fetch-service.ts](file:///home/aryan/Desktop/shopstr/shopstr/utils/nostr/fetch-service.ts#L100-L106) (inline function)
- [nip50-search.ts](file:///home/aryan/Desktop/shopstr/shopstr/utils/nostr/nip50-search.ts#L47-L53) (inline function)

**The Problem:**
The exact same `getEventKey` function for computing the NIP-01 replaceable event identity (`pubkey:d-tag`) is copy-pasted in two different files.

**The Fix:** Extract to a shared utility:
```typescript
// utils/nostr/event-identity.ts
export function getParameterizedEventKey(event: NostrEvent): string {
  if (event.kind >= 30000 && event.kind < 40000) {
    const dTag = event.tags?.find((tag) => tag[0] === "d")?.[1];
    if (dTag) return `${event.pubkey}:${dTag}`;
  }
  return event.id;
}
```

---

## 10. NIP-15 Interoperability Gap

**Severity: 🟠 High — Ecosystem Isolation**

**The Problem:**
As you correctly identified, Shopstr is tightly coupled to NIP-99 (`kind: 30402`). It cannot discover or display products from NIP-15 marketplaces (`kind: 30017` Stalls, `kind: 30018` Products).

This means:
- Merchants using other Nostr marketplace clients won't appear on Shopstr
- Shopstr listings won't appear on NIP-15-only clients
- No stall/storefront structure for commercial sellers

**The Fix:** Implement an adapter layer in the parser that normalizes both `30402` and `30018` events into the same `ProductData` type, plus fetch `30017` stall metadata for NIP-15 products.

---

## Summary Priority Matrix

| # | Issue | Severity | Effort | Impact |
|---|-------|----------|--------|--------|
| 1 | DB replaceable events | 🔴 Critical | Medium | Data integrity |
| 6 | Unprotected API routes | 🟠 High | Medium | Security |
| 10 | NIP-15 gap | 🟠 High | High | Interoperability |
| 2 | `new Promise(async)` | 🟡 Medium | Low | Error handling |
| 3 | Invoice card duplication | 🟡 Medium | High | Maintainability |
| 5 | God file split | 🟡 Medium | Medium | Code organization |
| 7 | localStorage crutch | 🟡 Medium | High | SSR & reactivity |
| 8 | Silent error swallowing | 🟡 Medium | Low | Debuggability |
| 4 | Duplicate caching | 🟢 Low | Trivial | Performance |
| 9 | Duplicated `getEventKey` | 🟢 Low | Trivial | DRY |

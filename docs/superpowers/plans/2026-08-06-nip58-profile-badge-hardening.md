# NIP-58 Profile Badge Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make NIP-58 badge rendering deterministic, non-blocking, retryable, metadata-independent, and safe when processing untrusted relay hints.

**Architecture:** Keep protocol parsing and relay planning in `utils/nostr/badges.ts`. Expose conclusive per-pubkey badge results and a bounded, scoped relay plan. Move badge application into a deduplicated background hydrator in `fetch-service.ts`; the profile component invokes that hydrator directly when metadata already exists.

**Tech Stack:** TypeScript, React, Nostr Tools, Jest, Testing Library, Next.js.

## Global Constraints

- Follow NIP-58 ordered consecutive `a`/`e` pairs and award-chain validation.
- Follow NIP-01 lowest-event-id replacement tie-breaking.
- Resolve at most four badges per profile and at most eight unique hinted relays per batch.
- Accept only credential-free `ws:` and `wss:` relay hints.
- Missing relay data must not erase existing badges.
- Core profile loading must not wait for badge relay requests.

---

### Task 1: Deterministic and bounded protocol parsing

**Files:**

- Modify: `utils/nostr/badges.ts`
- Test: `utils/nostr/__tests__/badges.test.ts`

**Interfaces:**

- Produces: `Nip58ProfileBadgeReference` with `awardRelayHint` and `definitionRelayHint`.
- Produces: deterministic profile-list and definition selection using `created_at`, then lexical `id`.
- Produces: `MAX_NIP58_PROFILE_BADGES = 4`.

- [ ] **Step 1: Write failing tests**

Add tests proving that equal-timestamp profile events and definitions select the lowest lexical id, both `a` and `e` hints are parsed, and callers can cap references at four without changing order.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- --runInBand utils/nostr/__tests__/badges.test.ts`

Expected: failures for the current arrival-order tie handling and absent definition hint.

- [ ] **Step 3: Implement minimal protocol changes**

Use a shared comparison equivalent to:

```ts
function isPreferredReplaceableEvent(
  candidate: NostrEvent,
  current: NostrEvent
) {
  if (candidate.created_at !== current.created_at) {
    return candidate.created_at > current.created_at;
  }
  return candidate.id.localeCompare(current.id) < 0;
}
```

Populate `definitionRelayHint` from `aTag[2]` and `awardRelayHint` from `eTag[2]`. Cap references at the fetch boundary with `slice(0, MAX_NIP58_PROFILE_BADGES)`.

- [ ] **Step 4: Run tests and verify GREEN**

Run the Task 1 command and require zero failures.

- [ ] **Step 5: Commit**

```bash
git add utils/nostr/badges.ts utils/nostr/__tests__/badges.test.ts
git commit -m "fix: make NIP-58 replacement deterministic"
```

### Task 2: Safe scoped relay resolution and conclusive results

**Files:**

- Modify: `utils/nostr/badges.ts`
- Test: `utils/nostr/__tests__/badges.test.ts`

**Interfaces:**

- Produces: `Nip58ProfileBadgesResult { badges: Nip58ProfileBadge[]; complete: boolean }` per pubkey.
- Produces: credential-free `ws:`/`wss:` hint validation, global hint cap `8`, and reference-scoped requests.

- [ ] **Step 1: Write failing tests**

Add tests asserting:

```ts
expect(result.get(profilePubkey)).toEqual({ badges: [], complete: true });
```

for an observed empty list, `complete: false` when an award or definition is missing, invalid/http/credential hints are omitted, no more than eight hints are contacted, and each hinted award/definition request contains only its associated reference.

- [ ] **Step 2: Run tests and verify RED**

Run the Task 1 command. Expected: the old `Map<string, Nip58ProfileBadge[]>` shape and pooled relay list fail the new assertions.

- [ ] **Step 3: Implement staged scoped fetching**

Fetch lists from configured relays. Fetch awards from configured relays in one batch and from each accepted award hint using only that reference's event id. Parse fetched award `a` hints, then fetch definitions from configured relays and accepted definition hints using only the matching issuer/d-tag filter. Deduplicate signed events by id before resolution.

Mark a result complete only when the selected list is empty or every referenced award and definition needed to evaluate the capped list was retrieved. Preserve resolved badges in incomplete results but let callers decide whether to replace cached state.

- [ ] **Step 4: Run tests and verify GREEN**

Run the Task 1 command and require zero failures.

- [ ] **Step 5: Commit**

```bash
git add utils/nostr/badges.ts utils/nostr/__tests__/badges.test.ts
git commit -m "fix: bound NIP-58 relay hint resolution"
```

### Task 3: Non-blocking resilient profile hydration

**Files:**

- Modify: `utils/nostr/fetch-service.ts`
- Modify: `components/utility-components/profile/profile-dropdown.tsx`
- Test: `utils/nostr/__tests__/fetch-service.test.ts`
- Test: `components/utility-components/profile/__tests__/profile-dropdown.test.tsx`

**Interfaces:**

- Produces: `hydrateNip58ProfileBadges(nostr, relays, pubkeys, editProfileContext, existingProfileMap): Promise<void>`.
- `fetchProfile` schedules this hydrator without awaiting it.
- In-flight and retry keys contain Nostr manager identity, normalized relay set, and pubkey; retry backoff is five seconds.

- [ ] **Step 1: Write failing service tests**

Add tests proving `fetchProfile` resolves while the badge fetch promise remains pending, incomplete results preserve existing badges, explicit empty results clear them, and a resolved badge creates `{ pubkey, content: {}, created_at: 0, badges }` when kind-0 metadata is absent.

- [ ] **Step 2: Run service tests and verify RED**

Run: `npm test -- --runInBand utils/nostr/__tests__/fetch-service.test.ts`

Expected: current `fetchProfile` remains pending and drops badges for missing profiles.

- [ ] **Step 3: Implement the background hydrator**

Deduplicate pending pubkeys, skip retry keys until their five-second deadline, and merge only complete results. Always clear in-flight state in `finally`; record backoff for thrown or incomplete results. Use the existing context merge callback so later profile data is retained.

- [ ] **Step 4: Run service tests and verify GREEN**

Run the Task 3 service command and require zero failures.

- [ ] **Step 5: Write failing component tests**

Replace permanent hydration-set expectations with tests that existing metadata calls `hydrateNip58ProfileBadges` directly, missing metadata still calls `fetchProfile`, and relay list changes generate a new hydration attempt after a failure.

- [ ] **Step 6: Run component tests and verify RED**

Run: `npm test -- --runInBand components/utility-components/profile/__tests__/profile-dropdown.test.tsx`

Expected: the component still routes all hydration through `fetchProfile` and permanently marks failures hydrated.

- [ ] **Step 7: Implement component retry wiring**

Remove `hydratedProfilePubkeys` and `inFlightProfileHydrationRequests`. Call the shared hydrator for existing profiles with undefined badges; retain `fetchProfile` only for opt-in missing metadata.

- [ ] **Step 8: Run component tests and verify GREEN**

Run both Task 3 test commands and require zero failures.

- [ ] **Step 9: Commit**

```bash
git add utils/nostr/fetch-service.ts utils/nostr/__tests__/fetch-service.test.ts components/utility-components/profile/profile-dropdown.tsx components/utility-components/profile/__tests__/profile-dropdown.test.tsx
git commit -m "fix: hydrate profile badges in the background"
```

### Task 4: Full regression and website verification

**Files:**

- Modify only files required by failures found below.

- [ ] **Step 1: Run focused tests**

```bash
npm test -- --runInBand utils/nostr/__tests__/badges.test.ts utils/nostr/__tests__/fetch-service.test.ts components/utility-components/profile/__tests__/profile-dropdown.test.tsx
```

- [ ] **Step 2: Run static and production checks**

```bash
npm run type-check
npm run lint -- --quiet
npm run format:check
npm run build
```

- [ ] **Step 3: Run the complete suite**

```bash
npm test -- --runInBand
```

- [ ] **Step 4: Run local browser smoke test**

Start the production server and use Playwright against a deterministic local fixture to verify a profile name renders a capped badge image, unsafe image URLs remain hidden, and the page remains interactive while badge relay work is pending.

- [ ] **Step 5: Inspect final diff**

Run `git diff upstream/main...HEAD` and `git diff --check`; verify the changes remain limited to NIP-58 behavior, tests, and design/plan documentation.

---
name: Contact list (kind 3) safety
description: Rules for mutating NIP-02 follow lists without clobbering remote state
---

Kind 3 is replaceable: publishing a new contact list replaces the user's follow list network-wide.

**Rule:** Never create a brand-new (first) contact list unless emptiness is confirmed by EVERY configured relay responding (not timing out) AND the DB cache responding empty AND no session-local signed event. `fetchLatestContactListEvent` uses `.every(didRespond)` — do not relax to `.some()`; a timed-out relay may be the one holding the real list.

**Why:** At PR #574 rollout the DB cache table starts empty for everyone, so one empty-responding relay + one timed-out relay would have created a fresh single-follow list and overwritten the user's follows.

**How to apply:** Normal follows/unfollows are unaffected once any source yields a latest event. First-list creation failing with `unverified-contact-list` is the intended safe behavior when a relay is unreachable (toast tells user to prune dead relays). Boot-path DB cache fetches must be time-bounded (AbortSignal.timeout) so a hung API route can't stall the follows pipeline.

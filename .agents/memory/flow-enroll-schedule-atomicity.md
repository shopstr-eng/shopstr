---
name: Flow enroll + schedule atomicity
description: Why every email-flow enroller must compensate when step scheduling fails after enrollment succeeds.
---

`enrollInFlow` and `scheduleStepExecutions` are two separate, non-transactional
DB operations. If enrollment succeeds but scheduling throws, the recipient is
left with an `active` enrollment that has zero queued step executions.

**Why:** dedup across the flow system skips anyone whose enrollment status is
`active` or `completed`. So a stranded active-with-no-executions row makes every
future send skip that contact forever — they never get any email.

**How to apply:** any code that enrolls contacts into a flow (e.g.
`pages/api/email/flows/enroll.ts`, `.../[flowId]/send-to-contacts.ts`) must, on a
scheduling failure, roll back by `cancelEnrollment(enrollment.id)`. Cancelled is
NOT in the dedup skip set, so a later run re-enrolls and retries. Note
`cancelEnrollment` currently has no other callers, so there is no unsubscribe
semantics to conflict with — treating cancelled as "retryable / not yet
received" is safe.

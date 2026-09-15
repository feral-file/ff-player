# Content viewing policy (draft coordinated contract, #3481)

The policy is a convenience viewing default on the current trusted-LAN
controller boundary, not tamper-resistant parental control. No production
labels, remote defaults, or rollout changes accompany this implementation.

`contentRating` on a DP-1 item is optional and its vocabulary is open
(dp1 §3.3). `general` and `mature` are the values this player recognises;
absence is unrated, and so is any other string. Optional `contentReasons`
preserves nonempty strings in the curator's own vocabulary. These are curator
judgments covered by the containing playlist signature, not manifest metadata
or a claim that the media was inspected.

`ContentPolicy` version 1 has three booleans:

- `showMatureContent`, default false: explicit viewer opt-in.
- `strictPersonal`, default false: apply the mature filter to personal casts.
- `blockUnratedCurated`, default false: operator-owned archive audit gate,
  enabled only after the change owner has reviewed catalog coverage.

Explicit opt-in permits all valid labels. Personal casts are otherwise
unfiltered unless strictPersonal is enabled. Curated casts exclude mature
items and, only after the audit gate, unrated items. Strict personal casts
still permit unrated items. Only `mature` hides anything: a rating this player
does not recognise is treated exactly as unrated, so no document is ever
refused, and no item ever hidden, because of a label the player cannot read.
Assuming otherwise would let a future vocabulary hide works no curator marked
mature. Shape is still checked — a rating that is not a string, or a malformed
`contentReasons`, remains invalid input. Unknown content context is rejected.

`displayPlaylist.request.contentContext` is `curated | personal`, outside the
signed DP-1 body. Missing context and every device default are curated.
Persisted cast, scheduled, refreshed and Recently played requests retain it. A
refresh is a source update to an existing cast, so it may carry an origin
forward or narrow it, never widen it. An absent context means "unchanged" and
inherits the cast's own origin; defaulting it to curated would filter a
viewer's own personal cast every time its source updated. An explicit `curated`
narrows and takes effect. An explicit `personal` is honoured only when the live
cast is already personal — otherwise a source update could reclassify a curated
playlist and walk mature content past the default filter with nobody casting
it. A refresh retains the context it was actually filtered under, not the one
the previous cast carried. A `display_at_boot` cast stores its context and the
signed playlist as one value: two keys would be two best-effort writes, and a
reboot between them could pair a playlist with the wrong origin. The context
sits beside the DP-1 document inside that value, never inside the document, and
a bare document written before the envelope existed reads as curated.
Filtering produces an internal playback projection, never a newly signed
document; signatures of a modified projection must be removed. A source
refresh is the same case — it replaces the item list, so the previous
playlist's signature cannot travel with it.

The daemon owns authoritative policy state. The player's `setContentPolicy`
CDP command receives the full policy, persists a device-local mirror, then
returns `{ok:true, contentPolicy, active:true}`. `getContentPolicy` reads that
same applied snapshot. Commands before hydration report
`contentPolicyUnavailable`. Malformed policy returns `invalidContentPolicy`.
Failed persistence cannot be reported as successful activation. The daemon
reconciles on each new player generation and must not report active based only
on a manifest or an old acknowledgement.

Admission rejects an all-filtered new cast with `contentBlocked` without
replacing the current work. Tightening settings is different: newly blocked
current/queued work must immediately retire without an outgoing-art crossfade,
and no stale timer, default fetch, persisted boot cast, or replay may restore
it. Policy is applied before source probes, manifest resolution and rendering —
on the immediate cast, on a scheduled playlist, and on what the boot record
stores, so a blocked work's unsupported source can never reject a playlist
whose playable works are sound. Anything written to a recovery snapshot
(scheduled task, boot record) has passed source validation in this version,
because replay deliberately does not re-validate.
The boot path hydrates the mirror before restoring any artwork. A cast that
arrives while the mirror is still being read is admitted whole and reconciled
by the hydration publish, which re-applies the real policy to the retained
payload; filtering it against the built-in default instead would reject a cast
the viewer opted into and leave nothing to reconcile. A corrupt mirror is the
other case and fails closed: nothing will repair it on its own, so
`displayPlaylist` refuses with `contentPolicyUnavailable` until the daemon
reconciles it. A read that fails after a write has already applied a policy does
not mark the mirror unreadable — the record it failed on has been replaced — and
any durable write clears the flag, including a resend of the policy already in
force.

The final rendering gate asks one question: is the work the renderer is
currently showing still allowed? It identifies that work by id AND source
together, never by URL alone, so a freshly blocked work cannot be kept on the
wall by an allowed sibling that happens to share its source.

For source refreshes, newly blocked current artwork retires immediately, even
if no replacement remains. Controld sends the internal refresh-only
`retireBlockedCurrent: true` hint when it has already removed the blocked
item's label from its playback projection. This applies to empty and mixed
projections; ordinary independent all-blocked casts still cannot replace the
current allowed work. The source/generation guard belongs to the refresher.

Verification covers the complete rating/context matrix, exact signed-field
carry, malformed input, mixed/all-filtered lists, unchanged source documents,
selection/index preservation, persistence failure, policy changes during load,
restart/default/scheduled paths, and the final rendering boundary. App/FF1
manual acceptance and explicit archive-audit confirmation remain release gates.

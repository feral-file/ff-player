# Content viewing policy (draft coordinated contract, #3481)

The policy is a convenience viewing default on the current trusted-LAN
controller boundary, not tamper-resistant parental control. No production
labels, remote defaults, or rollout changes accompany this implementation.

`contentRating` on a DP-1 item is optional `general | mature`. Absence is
unrated. Optional `contentReasons` preserves nonempty strings in the curator's
own vocabulary. These are curator judgments covered by the containing playlist
signature, not manifest metadata or a claim that the media was inspected.

`ContentPolicy` version 1 has three booleans:

- `showMatureContent`, default false: explicit viewer opt-in.
- `strictPersonal`, default false: apply the mature filter to personal casts.
- `blockUnratedCurated`, default false: operator-owned archive audit gate,
  enabled only after the change owner has reviewed catalog coverage.

Explicit opt-in permits all valid labels. Personal casts are otherwise
unfiltered unless strictPersonal is enabled. Curated casts exclude mature
items and, only after the audit gate, unrated items. Strict personal casts
still permit unrated items. Invalid labels are invalid input, never an
unrated escape hatch. Unknown content context is rejected.

`displayPlaylist.request.contentContext` is `curated | personal`, outside the
signed DP-1 body. Missing context and every device default are curated.
Persisted cast, scheduled, refreshed and Recently played requests retain it.
Filtering produces an internal playback projection, never a newly signed
document; signatures of a modified projection must be removed.

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
it. Policy is applied before source probes, manifest resolution and rendering.
The boot path hydrates the mirror before restoring any artwork. A corrupt
mirror fails closed pending daemon reconciliation.

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

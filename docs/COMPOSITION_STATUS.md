# Current composition in player status

`checkStatus.deviceSettings` reports the committed stage's `scaling`, `margin`
and `background`, after the DP-1 preference merge and current-showing Control
Center adjustments. These fields describe the screen, not the saved machine
default. `orientation`, `defaultDuration` and `tombstone` remain device settings.

`showingKey` is a random UUID generated for the committed showing. The renderer's
slot/work/source identity stays private: source URLs may contain signed access
credentials and must not enter composition status. The UUID changes at the same
slot/work/source boundary that resets `useArtworkSettings`, including a return
to a previous showing between polls, and stays stable for settings-only commits.
It is latched with the visual
settings: while an incoming work loads or crossfades, status keeps the outgoing
composition until the stage commits. Controllers must not infer this boundary
from work ID alone; consecutive slots may share an ID.

Before the first renderer commit there is no reportable composition or revision.
Ephemeral `updateDisplaySettings` requests must echo the observed UUID as
`showingKey`. The player rejects missing or mismatched targets and all ephemeral
writes while no showing is committed or the selected settings hook belongs to
an incoming showing. Persistent device-default writes remain device-scoped.

Adjacent playlist slots get distinct renderer transitions even when their work
ID and source match. Session adjustments are ignored on the first render of a
different showing, before the passive reset runs.

`compositionRevision` increments when a composition is committed, including
changes that return to the last polled values. This prevents controld's status
deduplication from hiding a second controller's quick revert. It is a change
marker, not a durable sequence across player restarts.

An accepted ephemeral `updateDisplaySettings` reply includes
`acceptedCompositionRevision`: the newest composition already committed when
the player accepted the command. A controller waits for a status revision above
that floor before settling its optimistic field. This distinguishes the
command's result (or a later external change) from a delayed report caused by a
different field before the command arrived. Persistent device-default replies
omit the field because they do not reconcile against the current composition.
Same-showing settings finish latching in React's layout phase, so an older
pending snapshot cannot receive a revision above a later command's returned
floor. Commands accepted within one browser task are committed together.

Margin retains its DP-1 representation: numbers are pixels, percent strings
are a percentage of each viewport dimension, and other CSS strings stay strings.
Background retains its CSS color representation. No mounted stage means no
composition identity, margin or background report; scaling then retains the
existing saved/default fallback. Composition snapshots are never persisted.

`feral-controld` must preserve all five composition fields in
its typed `PlayerStatus` decode and lightweight notification marshal. The app
seeds controls from status, keeps local optimism while commands settle, rolls
back rejected intents, and accepts fresh idle reports (including external
reverts). Each partial write changes only its named field and remains
`isSaved: false` in Control Center.

# Playlist Loop Contract

`ff-player` is the canonical playback surface for FF1 playlist loop behavior.

Each **Now Display** playlist (`DP1Action.NowDisplay`, including boot display) resets playback toggles on cast state: `loopMode` → `playlist`, `shuffle` → `false`. Remote clients can set other modes again after the new playlist is active.

## Loop modes

- `none`: play forward until the last artwork slot finishes, then hold on that final artwork until another command changes playback.
- `playlist`: play forward and wrap from the last artwork back to the first artwork.
- `one`: keep replaying the current artwork slot.

If loop mode changes away from `none` while FF1 is holding the final artwork, playback restarts from that current artwork's slot instead of waiting for another external command.

While **repeat-off is intentionally holding** the final artwork slot, the route keeps an explicit hold flag (not “no timer” alone, which is also true during timer gaps and infinite-duration items). In that hold state, a **queued** `setShuffle` or `refreshPlaylist` **promotes the new playlist on cast** instead of waiting for another slot-timer tick—because repeat-off would not schedule one. That is **not** “skip the current artwork’s slot”: shuffle still anchors the **current** item at index `0`, so the on-screen artwork can remain the same and a **new** finite slot timer may run for that item before advancing to the next artwork in the updated order.

## Advance and hold decisions

The slot timer and source-ended callback share one advance operation. A stale
item callback cannot advance the current slot; competing triggers publish at
most one index transition. Queued replacements are considered before deciding
whether to advance, replay, or hold.

| Trigger | `playlist` | `one` | `none` |
|---|---|---|---|
| Finite timer expires | Advance, wrapping at the end. A single-item list rearms its timer. | Rearm the current slot. Natively looping media keeps playing. | Advance until the final slot; then hold without another timer. |
| Media ends | Advance; a same-slot wrap reloads the media. | Reload the current slot and rearm any finite timer. | Advance until the final slot; then hold its end frame. |
| Renderer exhausts its failure budget | Use the same advance path as source end. | Start another bounded retry cycle on the current work. | Advance when possible; at the final slot retry in place and retain the hold flag. |
| Queued shuffle/refresh at an advance boundary | Promote before advancing. | Promote while retaining the current item when possible, otherwise select index 0. | Promote before a final-slot hold can prevent further advances. |
| Queued shuffle/refresh while already holding the final slot | Not a repeat-off hold. | Not a repeat-off hold. | Promote immediately on cast, retaining the current artwork where the queued order permits. |

An item with no finite duration has no slot timer. Natural media end or an
explicit command can still advance it; absence of a timer does not itself mean
the route is holding the final slot. A failure at a held final slot still checks
queued replacements before retrying, so a stuck work cannot strand a new list.

Changing loop mode away from a final-slot hold reloads the current work and
rearms its timer. Changing the saved default duration restarts the full effective
interval without reloading media. A late display-preference merge instead
preserves elapsed time when pacing is unchanged; authored duration vetoes and
natural-length media must not lose to an unresolved manifest's default timer.

## Route ownership

`playlist-client.tsx` renders the route. `usePlaylistPlayback` composes the view,
preview bridge, display preference, tombstone, and history callbacks.
`PlaylistTimeline` alone owns timer handles, deadlines, selection mirrors,
loop/hold state, and advance decisions. Callers read a slot snapshot or invoke an
operation; they do not mutate its fields.

`usePlaylistTimeline` binds the current view and preserves effect order: slot
entry and policy admission, late display-merge rearming, then cast commands.
Selection is synchronized in layout before asynchronous display preferences
can commit. Same-tick advances update the owner's index before publishing to
React or Canvas, so a second trigger cannot advance from a retired index.

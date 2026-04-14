# Playlist Loop Contract

`ff-player` is the canonical playback surface for FF1 playlist loop behavior.

Each **Now Display** playlist (`DP1Action.NowDisplay`, including boot display) resets playback toggles on cast state: `loopMode` → `playlist`, `shuffle` → `false`. Remote clients can set other modes again after the new playlist is active.

## Loop modes

- `none`: play forward until the last artwork slot finishes, then hold on that final artwork until another command changes playback.
- `playlist`: play forward and wrap from the last artwork back to the first artwork.
- `one`: keep replaying the current artwork slot.

If loop mode changes away from `none` while FF1 is holding the final artwork, playback restarts from that current artwork's slot instead of waiting for another external command.

While holding on the final artwork (no slot timer), a **queued** `setShuffle` or `refreshPlaylist` still applies immediately so the new item order is not stuck waiting for a slot that will not fire again.

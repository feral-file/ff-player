# Title card

How the player names a work (feral-file#3615; settled by Sean and Casey on an FF1, 2026-11-24).

- No label is drawn over the work. `TombstoneOverlay` stays in the tree and is held off while the form is `off`.
- A title card covers the screen in full black for `titleSeconds` (10): the exhibition's name at top right, the artist and the title at bottom left. The exhibition's name is the playlist's title and is left out for a lone work, whose playlist title only repeats the work's.
- It shows when a playlist starts and again every `episodeMinutes` (60), over whatever work is on. One work may run all day, so it does not wait for a change of work. The work keeps running behind the card and the card's seconds come out of the work's time.
- The first card of a playlist stays until the work behind it is on screen, for at most 15 more seconds, so a work that fails to load is not hidden for good. Once a card has left it does not come back until its next showing, whatever work comes on in between.
- The card's seconds start when there is a title to show. A work whose title never arrives gets no card.
- A playlist with no `id` is known by its title and its works, so a different one starts its own card.
- Known limit: a new playlist that reuses an item's `id` with a different source can lose its first card after ten seconds while that work is still loading, because the committed work is known by `id` alone.
- A QR code with a caption sits at bottom right when `qrUrl` is set, its foot on the baseline of the last line of text. `qrUrl` is empty in the build: the page it would open, and the place a playlist carries that link, do not exist yet.
- A work's year is not a DP-1 field. A title shows a year only when the title carries it.
- The owner's label setting still governs: with the label Off, no title card shows.
- Sending the same playlist again (same `id`) does not show the card again at the start.

Values live in `src/utils/labelTuning.ts` and are constants of the build. Which card is owed and when: `src/app/playlist/useExhibitionCards.ts`. What it looks like: `src/components/tombstone/ExhibitionCard.tsx`, sized by the short edge like the label (`TOMBSTONE_SIZING_CONTRACT.md`).

The earlier forms (`label`, `card`, `both`, with the opening card and the curator's note cards) remain in the code behind `form` and are not what the build shows.

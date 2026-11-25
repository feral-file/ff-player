'use client';

import type { CardContent } from '@/components/tombstone/ExhibitionCard';
import type { DP1Call, DP1Entity, DP1Item } from '@/models/dp1.model';
import { useTombstoneInfo } from '@/services/custom-hooks/useTombstoneInfo';
import { TombstoneMode } from '@/models/display_settings.model';
import { useLabelTuning, type LabelTuning } from '@/utils/labelTuning';
import { itemIdentityFor, normalizePlaylistIndex } from '@/utils/playlist';
import { useEffect, useMemo, useState } from 'react';

/**
 * How long a card may wait, past its own time, for the work behind it to be
 * on screen. A work that never loads must not leave the card up for good:
 * the player's own failure handling has to be visible.
 */
const WAIT_FOR_WORK_MS = 15000;

type CardKind = CardContent['kind'];
export interface Step {
  kind: CardKind;
  seconds: number;
}

/** "Ada", "Ada and Bo", "Ada, Bo and Cy"; partners are not curators. */
export function curatorNames(playlist: DP1Call | undefined): string | undefined {
  const names = (playlist?.curators ?? [])
    .filter((entity: DP1Entity) => entity.role !== 'partner')
    .map(entity => entity.name?.trim() ?? '')
    .filter(name => name !== '');
  if (names.length === 0) {
    return playlist?.curator ?? undefined;
  }
  if (names.length === 1) {
    return names[0];
  }
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`;
}

/**
 * The exhibition's name for the label and cards: the playlist's title, when
 * the playlist is more than one work shown on its own. A single work sent by
 * address has a title that only repeats the work's.
 */
export function exhibitionName(
  playlist: DP1Call | undefined,
  itemCount: number
): string | undefined {
  const title = playlist?.title.trim();
  if (!title) {
    return undefined;
  }
  const curated = Boolean(playlist?.note) || Boolean(curatorNames(playlist));
  return itemCount > 1 || curated ? title : undefined;
}

/**
 * The longest address the title card turns into a QR code. A longer one makes
 * a code too dense to scan at the card's size, and past a few thousand
 * characters the encoder throws, which would take the player down with it.
 */
export const MAX_LINK_LENGTH = 512;

/**
 * Where the title card's QR code leads: the first of the playlist's `links`
 * that is a web address short enough to scan. The playlist's publisher orders
 * them, so the first is the page they want read first. No such link, no code.
 */
export function playlistLink(playlist: DP1Call | undefined): string | undefined {
  const links: unknown = playlist?.links;
  if (!Array.isArray(links)) {
    return undefined;
  }
  for (const link of links as ({ url?: unknown } | null)[]) {
    const url = typeof link?.url === 'string' ? link.url.trim() : '';
    if (url.length <= MAX_LINK_LENGTH && /^https?:\/\/\S+$/i.test(url)) {
      return url;
    }
  }
  return undefined;
}

function noteSeconds(duration: number | undefined, tuning: LabelTuning): number {
  return typeof duration === 'number' && duration > 0
    ? duration
    : tuning.noteSeconds;
}

/** A description cut to what a card holds: its first paragraphs, whole sentences. */
export function cardDescription(text: string | undefined, limit = 420): string | undefined {
  const clean = (text ?? '').replace(/\r/g, '').trim();
  if (!clean) {
    return undefined;
  }
  let out = '';
  for (const sentence of clean.split(/(?<=[.!?])\s+/)) {
    if (out && out.length + sentence.length + 1 > limit) {
      break;
    }
    out = `${out} ${sentence}`.trim();
  }
  return out.length > limit ? `${out.slice(0, limit).trimEnd()}…` : out;
}

/** The cards owed before the work at `index`, in order. */
export function stepsFor(
  call: DP1Call | undefined,
  item: DP1Item | undefined,
  index: number,
  tuning: LabelTuning
): Step[] {
  const steps: Step[] = [];
  if (tuning.form === 'off') {
    // No label and no card per work: the title card alone, on its timer.
    if (item) {
      steps.push({ kind: 'title', seconds: tuning.titleSeconds });
    }
    return steps;
  }
  if (index === 0 && call?.note?.text) {
    steps.push({
      kind: 'opening',
      seconds: noteSeconds(call.note.duration, tuning),
    });
  }
  if (item?.note?.text) {
    steps.push({ kind: 'note', seconds: noteSeconds(item.note.duration, tuning) });
  } else if (item && tuning.form !== 'label') {
    steps.push({ kind: 'work', seconds: tuning.cardSeconds });
  }
  return steps;
}

/**
 * Walks the steps for one showing: each card for its seconds, then the last
 * one held until the work is on screen (or WAIT_FOR_WORK_MS passes).
 * Returns the current step index and whether a card covers the screen.
 */
export function useCardClock(
  showingKey: string,
  steps: Step[],
  workIsUp: boolean
) {
  const [state, setState] = useState({
    key: '',
    step: 0,
    timeUp: false,
    released: false,
    started: false,
  });
  const current = state.key === showingKey ? state : null;
  const stepCount = steps.length;
  const seconds = steps[current?.step ?? 0]?.seconds ?? 0;

  // A card that has left stays gone for its showing: a later change of work
  // (the title card's showing spans many works) or a title that arrives late
  // must not bring the black back.
  useEffect(() => {
    setState(previous => {
      if (previous.key === showingKey) {
        if (previous.released) {
          return previous;
        }
        // A card that was up and lost what it had to show (the work changed
        // to one with no title) has left; it does not start over.
        if (previous.started && stepCount === 0) {
          return { ...previous, released: true };
        }
      }
      return {
        key: showingKey,
        step: 0,
        timeUp: false,
        released: false,
        started: stepCount > 0,
      };
    });
  }, [showingKey, stepCount]);

  useEffect(() => {
    if (!current || current.timeUp || stepCount === 0) {
      return;
    }
    const isLast = current.step >= stepCount - 1;
    const timer = setTimeout(() => {
      setState(previous =>
        isLast
          ? { ...previous, timeUp: true }
          : { ...previous, step: previous.step + 1 }
      );
    }, seconds * 1000);
    return () => {
      clearTimeout(timer);
    };
  }, [current, stepCount, seconds]);

  const [waitedOut, setWaitedOut] = useState(false);
  const waiting = Boolean(current?.timeUp) && !workIsUp;
  useEffect(() => {
    setWaitedOut(false);
    if (!waiting) {
      return;
    }
    const timer = setTimeout(() => {
      setWaitedOut(true);
    }, WAIT_FOR_WORK_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [waiting, showingKey]);

  const held = waiting && !waitedOut;
  const leaving = Boolean(current?.timeUp) && !current?.released && !held;
  useEffect(() => {
    if (leaving) {
      setState(previous => ({ ...previous, released: true }));
    }
  }, [leaving]);

  const covering =
    stepCount > 0 &&
    showingKey !== '' &&
    (!current || (!current.released && (!current.timeUp || held)));
  return { step: Math.min(current?.step ?? 0, stepCount - 1), covering };
}

/**
 * What makes two casts the same playlist for the title card's clock. The
 * playlist's own `id` when it has one, so sending the same playlist again
 * does not restart the card. A playlist with no `id` is known by its title
 * and its works with their sources, so a different one still starts its own
 * card.
 */
function usePlaylistIdentity(call: DP1Call | undefined, items: DP1Item[]) {
  return useMemo(() => {
    if (call?.id) {
      return call.id;
    }
    const works = items
      .map((item, at) => `${itemIdentityFor(items, at)}@${item.source}`)
      .join(',');
    return `anon:${call?.title ?? ''}:${works}`;
  }, [call?.id, call?.title, items]);
}

/**
 * Form `off`: counts the title card's showings for one playlist. 0 when the
 * playlist starts, then one more every `episodeMinutes`, over whatever work
 * is on (one work may run all day, so it cannot wait for a change of work).
 */
function useTitleCardTick(playlistId: string, tuning: LabelTuning): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    setTick(0);
    if (tuning.form !== 'off' || tuning.episodeMinutes <= 0) {
      return;
    }
    const timer = setInterval(() => {
      setTick(previous => previous + 1);
    }, tuning.episodeMinutes * 60000);
    return () => {
      clearInterval(timer);
    };
  }, [playlistId, tuning.form, tuning.episodeMinutes]);
  return tick;
}

interface CardInputs {
  call: DP1Call | undefined;
  playlist: DP1Item[];
  currentIndex: number;
  showingKey: string;
  committedIdentity: string;
  enabled: boolean;
  tuning: LabelTuning;
}

/**
 * Decides the full-screen card for the selected work (feral-file#3615).
 *
 * Cards follow SELECTION, not the committed work: a card comes up as soon as
 * the player turns to the next work and stays while that work loads behind
 * it, so the note is read before the work is seen (playlists extension
 * §3.4). The label over the work keeps following the committed work
 * (`useTombstone`); `covering` tells the route to hold the label until the
 * card has left.
 *
 * The item's own duration clock is not paused while a card is up, so a card
 * takes its seconds out of the work's time on screen.
 */
export function useExhibitionCards(inputs: CardInputs) {
  const { call, playlist, currentIndex, showingKey, tuning } = inputs;
  const count = playlist.length;
  const index = count > 0 ? normalizePlaylistIndex(currentIndex, count) : 0;
  const item = currentIndex >= 0 && count > 0 ? playlist[index] : undefined;
  // A withheld work is never looked up: no manifest request names it.
  const { artistName, title } = useTombstoneInfo(
    inputs.enabled ? item : undefined
  );
  const playlistId = usePlaylistIdentity(call, playlist);
  const tick = useTitleCardTick(playlistId, tuning);
  const off = tuning.form === 'off';
  const steps = useMemo(
    () => {
      if (!inputs.enabled) {
        return [];
      }
      // Every other title card may stay a second length, to compare the two.
      const alternate = tuning.titleSecondsAlt > 0 && tick % 2 === 1;
      const owedSteps = stepsFor(call, item, index, tuning);
      // The title card's seconds start when there is a title to read: a
      // title that comes from a remote manifest may arrive late.
      if (off && !title) {
        return [];
      }
      return owedSteps.map(owed =>
        owed.kind === 'title' && alternate
          ? { ...owed, seconds: tuning.titleSecondsAlt }
          : owed
      );
    },
    [inputs.enabled, call, item, index, tuning, tick, off, title]
  );
  const workIsUp =
    item !== undefined &&
    itemIdentityFor(playlist, index) === inputs.committedIdentity;
  const clockKey =
    off && !tuning.titleEveryWork && showingKey !== ''
      ? `${playlistId}:${String(tick)}`
      : showingKey;
  const { step, covering } = useCardClock(clockKey, steps, workIsUp);
  const exhibition = tuning.exhibitionLine
    ? exhibitionName(call, count)
    : undefined;
  const position =
    tuning.position && count > 1
      ? `${String(index + 1)} / ${String(count)}`
      : undefined;

  const card = useMemo((): CardContent | null => {
    const current = steps.at(step);
    if (!current) {
      return null;
    }
    const note = current.kind === 'opening' ? call?.note : item?.note;
    return {
      kind: current.kind,
      key: `${clockKey}:${String(step)}`,
      seconds: current.seconds,
      // The title card names the exhibition as the label did: not for a
      // lone work, whose playlist title only repeats the work's.
      exhibition: current.kind === 'opening' ? call?.title : exhibition,
      description:
        current.kind === 'title' && tuning.titleDescription
          ? cardDescription(
              item?.note?.text ?? item?.inlineManifest?.metadata?.description
            )
          : undefined,
      link: current.kind === 'title' ? playlistLink(call) : undefined,
      position,
      curators: curatorNames(call),
      artist: artistName,
      title,
      noteTitle: note?.title,
      text: note?.text,
      credit: note?.author?.name,
    };
  }, [steps, step, call, item, clockKey, exhibition, position, artistName, title, tuning.titleDescription]);

  // A work or title card with nothing to name says nothing; skip it.
  const names = card?.kind === 'work' || card?.kind === 'title';
  const usable = card && (!names || card.title) ? card : null;
  return {
    card: usable,
    covering: covering && usable !== null,
    exhibitionLine: [exhibition, position].filter(Boolean).join(' · '),
  };
}

/**
 * The route's one call for everything this adds to the label: the tuning,
 * the current card, the exhibition line, and the label mode with the card's
 * hold applied. `mode` is the owner's label setting, already `Off` when the
 * work is withheld; `Off` means no text over the art, cards included.
 */
export function useExhibitionLabel(
  inputs: Omit<CardInputs, 'enabled' | 'tuning'> & { mode: TombstoneMode }
) {
  const { mode, ...rest } = inputs;
  const labelTuning = useLabelTuning();
  const cards = useExhibitionCards({
    ...rest,
    enabled: mode !== TombstoneMode.Off,
    tuning: labelTuning,
  });
  // The label waits for the card to leave. When the form is card-only and a
  // card named the work, the label does not follow it.
  const held =
    cards.covering ||
    labelTuning.form === 'off' ||
    (labelTuning.form === 'card' && cards.card?.kind === 'work');
  return {
    tombstoneMode: held ? TombstoneMode.Off : mode,
    labelTuning,
    card: cards.card,
    cardVisible: cards.covering,
    exhibitionLine: cards.exhibitionLine,
  };
}

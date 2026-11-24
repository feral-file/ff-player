/**
 * Contract for which cards a work is owed and what names the exhibition
 * (feral-file#3615): the playlist's note opens the exhibition once, an
 * item's note comes before that item, and a work with no note gets a card
 * only when the form asks for one.
 */
import type { DP1Call, DP1Item } from '@/models/dp1.model';
import { DEFAULT_LABEL_TUNING, mergeLabelTuning } from '@/utils/labelTuning';
import { describe, expect, it } from 'vitest';
import {
  cardDescription,
  curatorNames,
  exhibitionName,
  stepsFor,
} from './useExhibitionCards';

const item = (extra: Partial<DP1Item> = {}) =>
  ({ id: 'a', source: 'https://art.test/a', ...extra }) as DP1Item;
// The earlier forms, still reachable by changing the default.
const LABEL_FORM = mergeLabelTuning({ form: 'label' });
const call = (extra: Partial<DP1Call> = {}) =>
  ({ dpVersion: '1.1.0', title: 'Living Code', ...extra }) as DP1Call;

describe('stepsFor', () => {
  it('opens the exhibition with the playlist note, then the first item note', () => {
    const steps = stepsFor(
      call({ note: { text: 'About the show.', duration: 15 } }),
      item({ note: { text: 'About the work.' } }),
      0,
      LABEL_FORM
    );
    expect(steps).toEqual([
      { kind: 'opening', seconds: 15 },
      { kind: 'note', seconds: 20 },
    ]);
  });

  it('shows the playlist note only before the first work', () => {
    const steps = stepsFor(
      call({ note: { text: 'About the show.' } }),
      item(),
      3,
      LABEL_FORM
    );
    expect(steps).toEqual([]);
  });

  it('gives a work with no note a card only when the form asks for one', () => {
    const both = mergeLabelTuning({ form: 'both', cardSeconds: 6 });
    expect(stepsFor(call(), item(), 1, both)).toEqual([
      { kind: 'work', seconds: 6 },
    ]);
    expect(stepsFor(call(), item(), 1, LABEL_FORM)).toEqual([]);
  });

  it('with the default form owes one title card and nothing else', () => {
    const noted = item({ note: { text: 'A note.' } });
    const steps = stepsFor(
      call({ note: { text: 'Opening.' } }),
      noted,
      0,
      DEFAULT_LABEL_TUNING
    );
    expect(steps).toEqual([
      { kind: 'title', seconds: DEFAULT_LABEL_TUNING.titleSeconds },
    ]);
    expect(stepsFor(call(), undefined, 0, DEFAULT_LABEL_TUNING)).toEqual([]);
  });
});

describe('cardDescription', () => {
  it('keeps whole sentences up to the limit and drops the rest', () => {
    expect(cardDescription('One. Two. Three.', 9)).toBe('One. Two.');
    expect(cardDescription('  ')).toBeUndefined();
    expect(cardDescription(undefined)).toBeUndefined();
  });
});

describe('exhibition naming', () => {
  it('joins curators and leaves partners out', () => {
    expect(
      curatorNames(
        call({
          curators: [
            { name: 'Ada' },
            { name: 'Museum', role: 'partner' },
            { name: 'Bo' },
          ],
        })
      )
    ).toBe('Ada and Bo');
  });

  it('names the exhibition for a list or a curated playlist, not a lone work', () => {
    expect(exhibitionName(call(), 18)).toBe('Living Code');
    expect(exhibitionName(call(), 1)).toBeUndefined();
    expect(exhibitionName(call({ curators: [{ name: 'Ada' }] }), 1)).toBe(
      'Living Code'
    );
  });

  it('ignores tuning values of the wrong type', () => {
    expect(mergeLabelTuning({ form: 3, labelSeconds: '9' })).toEqual(
      DEFAULT_LABEL_TUNING
    );
  });
});

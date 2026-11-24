/**
 * Contract for the title card (feral-file#3615): the exhibition at top
 * right, the artist and title at bottom left, and a QR code with its caption
 * only when there is a link to lead to.
 */
import { DEFAULT_LABEL_TUNING, mergeLabelTuning } from '@/utils/labelTuning';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import ExhibitionCard, { type CardContent } from './ExhibitionCard';

afterEach(cleanup);

const title = (extra: Partial<CardContent> = {}): CardContent => ({
  kind: 'title',
  key: 'k',
  seconds: 10,
  exhibition: 'S01:E01',
  artist: 'p1xelfool',
  title: 'ezix (2021)',
  ...extra,
});

describe('ExhibitionCard, title kind', () => {
  it('names the exhibition, the artist and the work, with no code when there is no link', () => {
    render(
      <ExhibitionCard card={title()} visible tuning={DEFAULT_LABEL_TUNING} />
    );
    const card = screen.getByTestId('exhibition-card');
    expect(card.dataset.kind).toBe('title');
    expect(card.textContent).toContain('S01:E01');
    expect(card.textContent).toContain('p1xelfool');
    expect(card.textContent).toContain('ezix (2021)');
    expect(card.querySelector('svg')).toBeNull();
  });

  it('draws the code and its caption when the card has a link', () => {
    const tuning = mergeLabelTuning({ qrCaption: 'About this work' });
    render(
      <ExhibitionCard
        card={title({ link: 'https://feralfile.com/' })}
        visible
        tuning={tuning}
      />
    );
    const card = screen.getByTestId('exhibition-card');
    expect(card.querySelector('svg')).not.toBeNull();
    expect(card.textContent).toContain('About this work');
  });

  it('renders nothing without a card', () => {
    render(<ExhibitionCard card={null} visible tuning={DEFAULT_LABEL_TUNING} />);
    expect(screen.queryByTestId('exhibition-card')).toBeNull();
  });
});

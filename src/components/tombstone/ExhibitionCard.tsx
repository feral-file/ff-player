'use client';

import type { LabelTuning } from '@/utils/labelTuning';
import { QRCodeSVG } from 'qrcode.react';
import { CSSProperties, useEffect, useState } from 'react';
import { designPx } from './designPx';

/**
 * What one full-screen card says (feral-file#3615). Three kinds:
 * - `opening`: the exhibition's name, its curators and the playlist's note,
 *   before the first work.
 * - `note`: a curator's note before one work, with the work named above it.
 * - `work`: the work named on its own, when it has no note and the form asks
 *   for a card.
 * - `title`: the title card, with labels off: season and episode top right,
 *   the work on screen with its description, and a QR code to more.
 */
export interface CardContent {
  kind: 'opening' | 'note' | 'work' | 'title';
  key: string;
  seconds: number;
  exhibition?: string;
  position?: string;
  curators?: string;
  artist?: string;
  title?: string;
  noteTitle?: string;
  text?: string;
  credit?: string;
  description?: string;
  link?: string;
}

const FADE_MS = 900;

function frameStyle(tuning: LabelTuning, visible: boolean): CSSProperties {
  return {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    padding: designPx(50),
    backgroundColor: tuning.cardBackground,
    color: tuning.cardColor,
    fontFamily: "'PP Mori', sans-serif",
    fontSize: designPx(19 * tuning.cardScale),
    fontWeight: 400,
    lineHeight: 1.4,
    opacity: visible ? 1 : 0,
    transition: `opacity ${String(FADE_MS)}ms ease`,
    pointerEvents: 'none',
    zIndex: 30,
  };
}

function Opening({ card, tuning }: { card: CardContent; tuning: LabelTuning }) {
  const scale = tuning.cardScale;
  return (
    <div style={{ maxWidth: designPx(560) }}>
      <div
        style={{
          fontSize: designPx(64 * scale),
          fontWeight: 700,
          lineHeight: 1.1,
          letterSpacing: '-0.01em',
        }}>
        {card.exhibition}
      </div>
      {card.curators && (
        <div style={{ color: tuning.cardMuted, marginTop: designPx(9) }}>
          Curated by {card.curators}
        </div>
      )}
      {card.noteTitle && (
        <div style={{ marginTop: designPx(23), fontWeight: 700 }}>
          {card.noteTitle}
        </div>
      )}
      {card.text && (
        <div
          style={{
            marginTop: designPx(card.noteTitle ? 6 : 23),
            fontSize: designPx(23 * scale),
            lineHeight: 1.3,
            textWrap: 'pretty',
            whiteSpace: 'pre-line',
          }}>
          {card.text}
        </div>
      )}
      {card.credit && (
        <div
          style={{
            color: tuning.cardMuted,
            marginTop: designPx(12),
            fontSize: designPx(13 * scale),
          }}>
          {card.credit}
        </div>
      )}
    </div>
  );
}

function Work({ card, tuning }: { card: CardContent; tuning: LabelTuning }) {
  const scale = tuning.cardScale;
  const nameSize = designPx(30 * scale);
  return (
    <div style={{ maxWidth: designPx(560) }}>
      {card.artist && (
        <div style={{ fontSize: nameSize, lineHeight: 1.15 }}>{card.artist}</div>
      )}
      <div
        style={{
          fontSize: nameSize,
          lineHeight: 1.15,
          fontWeight: 700,
          fontStyle: 'italic',
        }}>
        {card.title}
      </div>
      {card.noteTitle && (
        <div style={{ marginTop: designPx(23), fontWeight: 700 }}>
          {card.noteTitle}
        </div>
      )}
      {card.text && (
        <div
          style={{
            marginTop: designPx(card.noteTitle ? 6 : 23),
            maxWidth: designPx(475),
            textWrap: 'pretty',
            whiteSpace: 'pre-line',
          }}>
          {card.text}
        </div>
      )}
      {card.credit && (
        <div
          style={{
            color: tuning.cardMuted,
            marginTop: designPx(12),
            fontSize: designPx(13 * scale),
          }}>
          {card.credit}
        </div>
      )}
    </div>
  );
}

function Title({ card, tuning }: { card: CardContent; tuning: LabelTuning }) {
  const scale = tuning.cardScale;
  const nameSize = designPx(44 * scale);
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        // The code's foot sits on the baseline of the last line of text.
        alignItems: 'last baseline',
        gap: designPx(40),
      }}>
      <div style={{ maxWidth: designPx(560) }}>
        {card.artist && (
          <div style={{ fontSize: nameSize, lineHeight: 1.12 }}>{card.artist}</div>
        )}
        <div
          style={{
            fontSize: nameSize,
            lineHeight: 1.12,
            fontWeight: 700,
            fontStyle: 'italic',
          }}>
          {card.title}
        </div>
        {card.description && (
          <div
            style={{
              marginTop: designPx(23),
              maxWidth: designPx(500),
              fontSize: designPx(21 * scale),
              lineHeight: 1.32,
              textWrap: 'pretty',
              whiteSpace: 'pre-line',
            }}>
            {card.description}
          </div>
        )}
      </div>
      {card.link && (
        <div
          style={{
            position: 'relative',
            width: designPx(120 * scale),
            flexShrink: 0,
          }}>
          <QRCodeSVG
            value={card.link}
            bgColor={tuning.cardBackground}
            fgColor={tuning.cardColor}
            marginSize={0}
            style={{
              display: 'block',
              width: designPx(120 * scale),
              height: designPx(120 * scale),
            }}
          />
          {tuning.qrCaption && (
            <div
              style={{
                // Hangs below the code so it does not move the alignment.
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: designPx(8),
                whiteSpace: 'nowrap',
                color: tuning.cardMuted,
                fontSize: designPx(13 * scale),
                lineHeight: 1.25,
              }}>
              {tuning.qrCaption}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Full-screen card drawn above the work. Presentational: the owning hook
 * (`useExhibitionCards`) decides which card is current and when it leaves.
 * `card` stays mounted through its fade-out so the text does not vanish
 * before the black does. Sized by the short edge like the label
 * (`docs/TOMBSTONE_SIZING_CONTRACT.md`).
 */
export default function ExhibitionCard({
  card,
  visible,
  tuning,
}: {
  card: CardContent | null;
  visible: boolean;
  tuning: LabelTuning;
}) {
  // A card that mounts already visible would cut in; one frame at opacity 0
  // first lets it fade in over the outgoing work.
  const [painted, setPainted] = useState(false);
  const present = card !== null;
  useEffect(() => {
    if (!present) {
      setPainted(false);
      return;
    }
    const frame = requestAnimationFrame(() => {
      setPainted(true);
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [present]);
  if (!card) {
    return null;
  }
  const centered = tuning.cardAlign === 'center';
  return (
    <div
      data-testid="exhibition-card"
      data-kind={card.kind}
      aria-hidden={!visible}
      style={frameStyle(tuning, visible && painted)}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          color: tuning.cardMuted,
          letterSpacing: '0.02em',
        }}>
        <span>
          {card.kind === 'opening' || card.kind === 'title' ? '' : card.exhibition}
        </span>
        <span>
          {card.kind === 'opening'
            ? ''
            : card.kind === 'title'
              ? card.exhibition
              : card.position}
        </span>
      </div>
      <div style={centered ? { margin: 'auto 0' } : undefined}>
        {card.kind === 'opening' ? (
          <Opening card={card} tuning={tuning} />
        ) : card.kind === 'title' ? (
          <Title card={card} tuning={tuning} />
        ) : (
          <Work card={card} tuning={tuning} />
        )}
      </div>
      {centered && <div />}
    </div>
  );
}

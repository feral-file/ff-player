'use client';

import { DP1Note } from '@/models/dp1.model';

export default function NoteCard({ note }: { note: DP1Note }) {
  console.log('[NoteCard] render', JSON.stringify(note));
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: '#000',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '8vh 8vw',
        textAlign: 'center',
      }}
    >
      <p
        style={{
          margin: 0,
          maxWidth: '28ch',
          fontSize: 'clamp(28px, 3vw, 56px)',
          lineHeight: 1.55,
          fontWeight: 400,
          letterSpacing: '0.01em',
        }}
      >
        {note.text}
      </p>
    </div>
  );
}

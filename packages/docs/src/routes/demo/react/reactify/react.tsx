/** @jsxImportSource react */
import {
  qwikify$,
  // @ts-ignore - somehow this errors
  reactify$,
} from '@qwik.dev/react';
import { QwikCounter } from './counter';

const Counter = reactify$(QwikCounter);

function Card() {
  return (
    <div
      style={{
        border: '2px solid #333',
        borderRadius: '8px',
        padding: '12px',
      }}
    >
      <h3>React Card</h3>
      <p>This Qwik counter resumes instantly:</p>
      <Counter label="Clicks" />
    </div>
  );
}

export const QCard = qwikify$(Card, { eagerness: 'idle' });

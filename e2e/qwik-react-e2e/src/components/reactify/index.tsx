/** @jsxImportSource react */
import { useState } from 'react';
import { qwikify$, reactify$ } from '@qwik.dev/react';
import { QwikBadge } from './badge';

// Wrap with reactify$ so it can be used inside React
const ReactBadge = reactify$(QwikBadge);

// A React app that uses Qwik badges via reactify$
function ReactAppWithQwik() {
  const [reactCount, setReactCount] = useState(0);
  const [badgeCount, setBadgeCount] = useState(2);

  return (
    <div data-testid="react-app">
      <h2>React App with Qwik Badges</h2>

      <span data-testid="react-count">react count {reactCount}</span>
      <button data-testid="react-inc" onClick={() => setReactCount((v) => v + 1)}>
        react inc
      </button>

      <div>
        <span data-testid="badge-count">badges: {badgeCount}</span>
        <button data-testid="add-badge" onClick={() => setBadgeCount((v) => v + 1)}>
          + badge
        </button>
        <button data-testid="remove-badge" onClick={() => setBadgeCount((v) => Math.max(0, v - 1))}>
          - badge
        </button>
      </div>

      {Array.from({ length: badgeCount }, (_, i) => (
        <ReactBadge key={i} label={`Badge #${i} (react=${reactCount})`} />
      ))}
    </div>
  );
}

export const QReactApp = qwikify$(ReactAppWithQwik, { eagerness: 'idle' });

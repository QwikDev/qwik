import { component$, type QRL, Slot, useStore } from '@builder.io/qwik';

export default component$(() => {
  return (
    <Button onTripleClick$={() => alert('TRIPLE CLICKED!')}>
      Triple Click me!
    </Button>
  );
});

type ButtonProps = {
  onTripleClick$: QRL<() => void>;
};

export const Button = component$<ButtonProps>(({ onTripleClick$ }) => {
  const state = useStore({
    clicks: 0,
    lastClickTime: 0,
  });
  return (
    <button
      onClick$={() => {
        // triple click logic
        const now = Date.now();
        const timeBetweenClicks = now - state.lastClickTime;
        state.lastClickTime = now;
        if (timeBetweenClicks > 500) {
          state.clicks = 0;
        }
        state.clicks++;
        if (state.clicks === 3) {
          // handle custom event
          onTripleClick$();
          state.clicks = 0;
        }
      }}
    >
      <Slot />
    </button>
  );
});

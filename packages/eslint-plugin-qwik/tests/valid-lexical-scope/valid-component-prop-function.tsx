import { component$, type QRL } from '@qwik.dev/core';

export default component$<{ onClick$: QRL<() => void> }>(({ onClick$ }) => {
  return (
    <button
      onClick$={() => {
        onClick$();
      }}
    />
  );
});

import { component$, type QRL } from '@qwikdev/core';

export default component$<{ onClick$: QRL<() => void> }>(({ onClick$ }) => {
  return (
    <button
      onClick$={() => {
        onClick$();
      }}
    />
  );
});

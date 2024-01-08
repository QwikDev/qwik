import { component$, type QRL } from '@builder.io/qwik';

export default component$<{ onClick$: QRL<() => void> }>(({ onClick$ }) => {
  return (
    <button
      onClick$={() => {
        onClick$();
      }}
    />
  );
});

import { component$, type PropFunction } from '@builder.io/qwik';

export default component$<{ onClick$: PropFunction<() => void> }>(({ onClick$ }) => {
  return (
    <button
      onClick$={() => {
        onClick$();
      }}
    />
  );
});

import { type PropFunction, component$, Slot } from '@builder.io/qwik';

export default component$(() => {
  return <CmpButton onClick$={() => alert('CLICKED!')}>click me!</CmpButton>;
});

export const CmpButton = component$<{
  // Important to tell TypeScript that this is async
  onClick$?: PropFunction<() => void>;
}>(({ onClick$ }) => {
  return (
    <button onClick$={onClick$}>
      <Slot />
    </button>
  );
});

import { component$, useSignal } from '@builder.io/qwik';

export default component$(() => {
  const position = useSignal<{ x: number; y: number }>();
  return (
    <div
      onClick$={(event) => (position.value = { x: event.x, y: event.y })}
      style="height: 100vh"
    >
      <p>
        Clicked at: ({position.value?.x}, {position.value?.y})
      </p>
    </div>
  );
});

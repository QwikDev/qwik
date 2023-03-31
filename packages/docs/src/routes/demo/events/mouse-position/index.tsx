import { component$, useSignal, $ } from '@builder.io/qwik';

export default component$(() => {
  const position = useSignal<{ x: number; y: number }>();
  return (
    <div onClick$={(event) => (position.value = { x: event.x, y: event.y })}>
      <div>1</div>
      <div>2</div>
      <div>
        Clicked at: ({position.value?.x}, {position.value?.y})
      </div>
    </div>
  );
});

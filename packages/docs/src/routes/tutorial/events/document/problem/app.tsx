/* eslint-disable no-console */
import { component$, useStore } from '@builder.io/qwik';

export default component$(() => {
  const store = useStore({ x: 0, y: 0 });
  return (
    <div
      onMouseMove$={(event) => {
        store.x = event.clientX;
        store.y = event.clientY;
        console.log(store);
      }}
    >
      Your mouse location is ({store.x}, {store.y}).
    </div>
  );
});

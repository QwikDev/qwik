/* eslint-disable no-console */
import { component$ } from '@builder.io/qwik';

export const App = component$(() => {
  return (
    <div onMouseMove$={(event) => console.log(`x=${event.x}; y=${event.y}`)}>
      Move your mouse over this text.
    </div>
  );
});

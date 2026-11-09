import { component$, useComputed$, useSignal, useTask$ } from '@qwik.dev/core';
import { NavTreeChild } from './nav-tree-child';

export const NavTree = component$(() => {
  const input = useSignal(1);
  const out = useSignal(0);
  useTask$(({ track }) => {
    const n = track(input);
    out.value = n && n + 1;
  });
  const incremented = useComputed$(() => out.value && out.value + 1);
  return (
    <div class="level">
      <span class="step">level 1: {incremented.value}</span>
      <NavTreeChild input={incremented} />
    </div>
  );
});

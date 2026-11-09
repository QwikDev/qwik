import { component$, useComputed$, useSignal, useTask$ } from '@qwik.dev/core';
import { NavTreeChild } from './nav-tree-child';

export const NavTree = component$(() => {
  const input = useSignal(1);
  const out = useSignal(0);
  useTask$(({ track }) => {
    out.value = track(input) * 2;
  });
  const doubled = useComputed$(() => out.value * 2);
  return (
    <div class="level">
      <span class="step">level 1: {doubled.value}</span>
      <NavTreeChild input={doubled} />
    </div>
  );
});

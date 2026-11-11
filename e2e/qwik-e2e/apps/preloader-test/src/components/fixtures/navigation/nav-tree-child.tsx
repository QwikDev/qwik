import { component$, useComputed$, type ReadonlySignal } from '@qwik.dev/core';
import { NavTreeGrandchild } from './nav-tree-grandchild';

export const NavTreeChild = component$<{ input: ReadonlySignal<number> }>(({ input }) => {
  const out = useComputed$(async ({ track }) => {
    const n = track(input);
    return n && n + 1;
  });
  return (
    <div class="level">
      <span class="step">B: {out.value}</span>
      <NavTreeGrandchild input={out} />
    </div>
  );
});

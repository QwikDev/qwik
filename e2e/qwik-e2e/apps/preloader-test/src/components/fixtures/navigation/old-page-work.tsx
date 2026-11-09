import { component$ } from '@qwik.dev/core';
import ConditionalAll from '~/components/fixtures/conditional/all';
import SingleAll from '~/components/fixtures/single/all';
import TreeAll from '~/components/fixtures/tree/all';

export const OldPageWork = component$(() => {
  return (
    <>
      <SingleAll />
      <TreeAll />
      <ConditionalAll />
    </>
  );
});

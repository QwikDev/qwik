import { component$ } from '@qwik.dev/core';
import type { DocumentHead } from '@qwik.dev/router';
import { Heavy } from '~/components/fixtures/speculative/heavy';
import SingleTaskChain from '~/components/fixtures/single/task-chain';

export default component$(() => (
  <>
    <Heavy />
    <SingleTaskChain />
  </>
));

export const head: DocumentHead = { title: 'heavy chunk' };

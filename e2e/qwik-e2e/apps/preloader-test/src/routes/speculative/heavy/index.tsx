import { component$ } from '@qwik.dev/core';
import type { DocumentHead } from '@qwik.dev/router';
import { Heavy } from '~/components/fixtures/speculative/heavy';
import SingleTask from '~/components/fixtures/single/task';

export default component$(() => (
  <>
    <Heavy />
    <SingleTask />
  </>
));

export const head: DocumentHead = { title: 'heavy chunk' };

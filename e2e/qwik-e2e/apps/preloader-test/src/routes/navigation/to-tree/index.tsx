import { component$ } from '@qwik.dev/core';
import type { DocumentHead } from '@qwik.dev/router';
import { NavTree } from '~/components/fixtures/navigation/nav-tree';

export default component$(() => (
  <section class="fixture" data-fixture="navigation/to-tree">
    <h2>tree page</h2>
    <NavTree />
  </section>
));

export const head: DocumentHead = { title: 'tree page' };

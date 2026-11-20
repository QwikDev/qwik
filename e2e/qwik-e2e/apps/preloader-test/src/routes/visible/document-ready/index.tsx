import { component$ } from '@qwik.dev/core';
import type { DocumentHead } from '@qwik.dev/router';
import Fixture from '~/components/fixtures/visible/document-ready';

export default component$(() => (
  <>
    <div class="spacer" />
    <Fixture />
  </>
));

export const head: DocumentHead = { title: 'visible task, document-ready' };

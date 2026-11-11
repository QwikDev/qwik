import { component$ } from '@qwik.dev/core';
import type { DocumentHead } from '@qwik.dev/router';
import VisibleBelow from '~/components/fixtures/visible/below';

export default component$(() => (
  <>
    <div class="spacer" />
    <VisibleBelow />
  </>
));

export const head: DocumentHead = { title: 'visible task below the fold' };

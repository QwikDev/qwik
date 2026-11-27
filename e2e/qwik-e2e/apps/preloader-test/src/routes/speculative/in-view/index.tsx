import { component$ } from '@qwik.dev/core';
import type { DocumentHead } from '@qwik.dev/router';
import { InViewButton } from '~/components/fixtures/in-view/in-view-button';
import { OffScreenButton } from '~/components/fixtures/in-view/off-screen-button';

export default component$(() => (
  <div style={{ display: 'flex', flexDirection: 'column-reverse' }}>
    <OffScreenButton />
    <div class="spacer" />
    <InViewButton />
  </div>
));

export const head: DocumentHead = { title: 'in view after an off-screen button in the HTML' };

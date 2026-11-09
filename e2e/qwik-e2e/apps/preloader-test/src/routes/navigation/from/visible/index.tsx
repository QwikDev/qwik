import { component$ } from '@qwik.dev/core';
import type { DocumentHead } from '@qwik.dev/router';
import { NavigationLinks } from '~/components/fixtures/navigation/links';
import { OldPageWork } from '~/components/fixtures/navigation/old-page-work';

export default component$(() => (
  <>
    <NavigationLinks prefetch="visible" />
    <OldPageWork />
  </>
));

export const head: DocumentHead = { title: 'navigation from (visible)' };

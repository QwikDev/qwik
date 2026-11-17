import { component$, Slot } from '@qwik.dev/core';
import { DocsSidebar } from '~/components/fixtures/navigation/docs-sidebar';

export default component$(() => (
  <>
    <DocsSidebar />
    <Slot />
  </>
));

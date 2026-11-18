import { component$, Slot } from '@qwik.dev/core';
import { ShellBanner } from '~/components/fixtures/navigation/shell-banner';
import { ShellLinks } from '~/components/fixtures/navigation/shell-links';

export default component$(() => (
  <>
    <ShellLinks />
    <ShellBanner />
    <Slot />
  </>
));

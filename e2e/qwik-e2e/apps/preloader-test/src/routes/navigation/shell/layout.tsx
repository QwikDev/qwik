import { component$, Slot } from '@qwik.dev/core';
import { useLocation } from '@qwik.dev/router';
import { ShellBanner } from '~/components/fixtures/navigation/shell-banner';
import { ShellLinks } from '~/components/fixtures/navigation/shell-links';

export default component$(() => {
  const loc = useLocation();
  return (
    <>
      <ShellLinks />
      <ShellBanner />
      <p data-testid="inline-url">{loc.url.pathname}</p>
      <Slot />
    </>
  );
});

import { component$, Slot } from '@qwik.dev/core';
import { ByUrlLinks } from '~/components/fixtures/navigation/by-url-links';
import { UrlBanner } from '~/components/fixtures/navigation/url-banner';

export default component$(() => (
  <>
    <ByUrlLinks />
    <UrlBanner />
    <Slot />
  </>
));

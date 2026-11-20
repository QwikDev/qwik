import { component$ } from '@qwik.dev/core';
import { useLocation } from '@qwik.dev/router';

export const UrlBanner = component$(() => {
  const loc = useLocation();
  if (loc.url.pathname.endsWith('/b/')) {
    return <strong data-testid="url-banner">on page b</strong>;
  }
  return <p data-testid="url-banner">elsewhere</p>;
});

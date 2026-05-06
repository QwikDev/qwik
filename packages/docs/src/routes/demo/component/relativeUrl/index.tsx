import { component$ } from '@qwik.dev/core';
import { useLocation } from '@qwik.dev/router';

export default component$(() => {
  const loc = useLocation();
  const relativeUrl = '/mock';
  const absoluteUrl = loc.url.origin + relativeUrl;

  return (
    <section>
      <div>Relative URL: {relativeUrl}</div>
      <div>Absolute URL: {absoluteUrl}</div>
    </section>
  );
});

import { useLocation } from '@qwik.dev/city';
import { component$ } from '@qwik.dev/core';

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

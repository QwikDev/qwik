import { component$ } from '@qwik.dev/core';
import { Link, routeLoader$ } from '@qwik.dev/router';

export const useCached = routeLoader$(() => crypto.randomUUID(), {
  cacheControl: { public: true, maxAge: 3600 },
});
export const useImmutable = routeLoader$(() => crypto.randomUUID(), {
  cacheControl: 'immutable',
});

export default component$(() => {
  const cached = useCached();
  const immutable = useImmutable();
  return (
    <>
      <output id="cached-loader-token">{cached.value}</output>
      <output id="immutable-loader-token">{immutable.value}</output>
      <Link id="cache-parent" href="/qwikrouter-test.prod/loader-cache/" prefetch={false}>
        Parent
      </Link>
    </>
  );
});

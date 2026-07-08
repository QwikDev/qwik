import { component$ } from '@qwik.dev/core';
import { Link, routeLoader$ } from '@qwik.dev/router';
import { IMPORTED_LOADER_SHARED_KEY } from '../../../loaders-serialization/shared-map';

export const useQLoaderSharedMap = routeLoader$(
  ({ params, sharedMap, url }) => {
    const shared = sharedMap.get(IMPORTED_LOADER_SHARED_KEY) as { value: string } | undefined;

    return {
      pathname: url.pathname,
      slug: params.slug,
      value: shared?.value ?? 'missing',
    };
  },
  { serializationStrategy: 'always' }
);

export default component$(() => {
  const data = useQLoaderSharedMap();

  return (
    <section>
      <h1>Q Loader Shared Map</h1>
      <p id="q-loader-shared-map-value">{data.value.value}</p>
      <p id="q-loader-shared-map-pathname">{data.value.pathname}</p>
      <p id="q-loader-shared-map-slug">{data.value.slug}</p>
      <Link
        href="/qwikrouter-test/q-loader-shared-map/two/nested/"
        id="q-loader-shared-map-link-two"
        prefetchData="off"
      >
        Two Nested
      </Link>
    </section>
  );
});

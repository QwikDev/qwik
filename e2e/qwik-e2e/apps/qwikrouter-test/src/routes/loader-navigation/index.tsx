import { component$, type ComputedSignal } from '@qwik.dev/core';
import { Link, routeLoader$, type DocumentHead } from '@qwik.dev/router';

export const useParentData = routeLoader$(() => ({ hello: 'parent', token: crypto.randomUUID() }), {
  id: 'navigation-parent',
});

export default component$(() => {
  const parentData = useParentData();
  return (
    <>
      <p>{parentData.value.hello}</p>
      <button
        id="refresh-parent-loader"
        onClick$={() => (parentData as ComputedSignal<unknown>).invalidate(true)}
      >
        Refresh
      </button>
      <Link id="loader-hash" href="/qwikrouter-test/loader-navigation/#anchor" prefetch={false}>
        Anchor
      </Link>
      <Link
        id="loader-static-child"
        href="/qwikrouter-test/loader-navigation/child/"
        prefetch={false}
      >
        Static child
      </Link>
      <Link
        id="loader-dynamic-child"
        href="/qwikrouter-test/loader-navigation/42/"
        prefetch={false}
      >
        Dynamic child
      </Link>
    </>
  );
});

export const head: DocumentHead = ({ resolveValue }) => ({
  title: resolveValue(useParentData).hello,
  meta: [{ name: 'lifecycle-token', content: resolveValue(useParentData).token }],
});

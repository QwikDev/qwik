import { component$ } from '@qwik.dev/core';
import { Link, routeLoader$, type DocumentHead } from '@qwik.dev/router';

export const useChildData = routeLoader$(
  ({ params, redirect }) => {
    if (params.id === 'redirect') {
      throw redirect(302, '/qwikrouter-test/loader-navigation/child/');
    }
    return { hello: `child ${params.id}`, token: crypto.randomUUID() };
  },
  {
    id: 'navigation-dynamic-child',
  }
);

export default component$(() => {
  const child = useChildData();
  return (
    <>
      <output id="dynamic-loader-token">{child.value.token}</output>
      <p id="dynamic-loader-value">{child.value.hello}</p>
      <Link id="loader-parent" href="/qwikrouter-test/loader-navigation/" prefetch={false}>
        Parent
      </Link>
    </>
  );
});

export const head: DocumentHead = ({ resolveValue }) => ({
  title: resolveValue(useChildData).hello,
});

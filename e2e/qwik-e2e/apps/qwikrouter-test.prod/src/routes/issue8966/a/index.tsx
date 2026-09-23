import { component$, useStore, useTask$ } from '@qwik.dev/core';
import { Link, routeLoader$, useNavigate } from '@qwik.dev/router';

export const useData = routeLoader$(() => 'a');

export default component$(() => {
  const data = useData();
  const local = useStore({ value: data.value });
  const navigate = useNavigate();

  useTask$(({ track }) => {
    local.value = track(() => data.value);
  });

  return (
    <>
      <p>{local.value}</p>
      <Link id="issue8966-b" href="/qwikrouter-test.prod/issue8966/b/">
        B
      </Link>
      <button id="issue8966-goto-b" onClick$={() => navigate('/qwikrouter-test.prod/issue8966/b/')}>
        B with goto
      </button>
    </>
  );
});

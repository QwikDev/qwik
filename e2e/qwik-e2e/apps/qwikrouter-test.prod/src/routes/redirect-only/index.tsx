import { component$ } from '@qwik.dev/core';
import { Form, Link, routeAction$ } from '@qwik.dev/router';

export const useGo = routeAction$(async (_, { redirect }) => {
  throw redirect(302, '/qwikrouter-test.prod/redirect-only/target/');
});

export default component$(() => {
  const go = useGo();
  return (
    <>
      <h1 id="redirect-only-start">redirect only: start</h1>
      <Form action={go}>
        <button id="redirect-only-submit" type="submit">
          action that redirects to an onGet-only route
        </button>
      </Form>
      <Link href="/qwikrouter-test.prod/redirect-only/target/" data-test-link="redirect-only">
        link to an onGet-only route
      </Link>
    </>
  );
});

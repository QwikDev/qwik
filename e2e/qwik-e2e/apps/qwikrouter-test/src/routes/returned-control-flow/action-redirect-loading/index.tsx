import { component$ } from '@qwik.dev/core';
import { Form, routeAction$ } from '@qwik.dev/router';

export const useRedirectAction = routeAction$((_data, { redirect }) => {
  throw redirect(302, '/qwikrouter-test/returned-control-flow/action-redirect-loading-target/');
});

export default component$(() => {
  const action = useRedirectAction();
  return (
    <Form action={action}>
      <button id="redirect-action-submit" type="submit">
        Submit
      </button>
      <output id="redirect-action-running">{String(action.isRunning)}</output>
      <p id="redirect-action-page">Redirecting</p>
    </Form>
  );
});

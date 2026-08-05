import { component$ } from '@qwik.dev/core';
import { Form, routeAction$ } from '@qwik.dev/router';

// Calls redirect() but neither throws nor returns the signal.
export const useRedirectAction = routeAction$((_data, { redirect }) => {
  redirect(302, '/qwikrouter-test/returned-control-flow/target/');
});

export default component$(() => {
  const action = useRedirectAction();
  return (
    <Form action={action}>
      <button type="submit">Submit</button>
    </Form>
  );
});

import { Form, routeAction$ } from "@qwik.dev/city";
import { component$ } from "@qwik.dev/core";

export const useAction = routeAction$((_, context) => {
  throw context.redirect(
    302,
    "/qwikcity-test/action-redirect-without-search-params-target/",
  );
});

export default component$(() => {
  const action = useAction();

  return (
    <Form action={action}>
      <h1>Should have searchParams</h1>
      <button type="submit">Submit</button>
    </Form>
  );
});

import { routeAction$, Form } from "@qwik.dev/router";
import { component$ } from "@qwik.dev/core";

export const useAction = routeAction$((_, event) => {
  throw event.redirect(
    302,
    "/qwikrouter-test/action-redirect-without-search-params-target/",
  );
});

export default component$(() => {
  const action = useAction();

  return (
    <Form action={action}>
      <h1>Should have searchParams on the url</h1>
      <button type="submit">Submit</button>
    </Form>
  );
});

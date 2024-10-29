import { Form, routeAction$ } from "@qwik.dev/router";
import { component$ } from "@qwik.dev/core";

export const useAction = routeAction$(() => ({ ok: true }));

export default component$(() => {
  const action = useAction();

  return (
    <Form action={action}>
      <button name="test" value="test">
        Submit
      </button>

      {action.value?.ok && <span id="status">Submitted</span>}
    </Form>
  );
});

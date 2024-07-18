import { routeAction$, Form } from "@builder.io/qwik-city";
import { component$ } from "@builder.io/qwik";

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

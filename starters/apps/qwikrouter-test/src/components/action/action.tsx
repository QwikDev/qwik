import { Form, globalAction$ } from "@qwik.dev/router";
import { component$ } from "@qwik.dev/core";

export const useAction = globalAction$(() => {
  return true;
});

export const ActionStandalone = component$(() => {
  const action = useAction();
  return (
    <div>
      <h1>Test</h1>
      <Form action={action}>
        <input type="text" name="name" />
        <button>Send</button>
      </Form>
    </div>
  );
});

import { Form, globalAction$ } from "@qwik.dev/city";
import { component$ } from "@qwik.dev/core";

export const useOtherAction = globalAction$(() => {
  return {
    secret: "this is the secret",
    date: new Date(),
  };
});

export default component$(() => {
  const other = useOtherAction();
  return (
    <div>
      <Form action={other}>
        <button id="submit">Submit</button>
      </Form>
    </div>
  );
});

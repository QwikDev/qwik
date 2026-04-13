import { component$ } from '@qwik.dev/core';
import { Form, routeAction$ } from '@qwik.dev/router';

export const useEcho = routeAction$((data) => {
  return { echoed: String(data.text ?? '') };
});

export default component$(() => {
  const action = useEcho();
  return (
    <Form action={action}>
      <input name="text" type="text" />
      <button type="submit">send</button>
      {action.value?.echoed ? <p>echo: {action.value.echoed}</p> : null}
    </Form>
  );
});

import { component$ } from '@qwik.dev/core';
import { Form, routeAction$ } from '@qwik.dev/router';

// Returns the error signal instead of throwing it.
export const useErrorAction = routeAction$((_data, { error }) =>
  error(403, 'returned-action-error')
);

export default component$(() => {
  const action = useErrorAction();
  return (
    <Form action={action}>
      <button type="submit">Submit</button>
    </Form>
  );
});

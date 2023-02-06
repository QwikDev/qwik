import { component$ } from '@builder.io/qwik';
import { action$, Form } from '@builder.io/qwik-city';

export const otherAction = action$(() => {
  return {
    secret: 'this is the secret',
    date: new Date(),
  };
});

export default component$(() => {
  const other = otherAction.use();
  return (
    <div>
      <Form action={other}>
        <button id="submit">Submit</button>
      </Form>
    </div>
  );
});

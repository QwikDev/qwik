import { component$ } from '@builder.io/qwik';
import { action$, Form } from '@builder.io/qwik-city';

export const useOtherAction = action$(() => {
  return {
    secret: 'this is the secret',
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

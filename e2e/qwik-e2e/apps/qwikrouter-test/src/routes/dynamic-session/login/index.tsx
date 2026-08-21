import { component$ } from '@qwik.dev/core';
import { Form } from '@qwik.dev/router';
import { useDynamicSignIn } from '../../plugin@dynamic-session';

export default component$(() => {
  const signIn = useDynamicSignIn();

  return (
    <Form action={signIn}>
      <button type="submit">Sign in</button>
    </Form>
  );
});

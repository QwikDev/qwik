import { Show, component$, useSignal } from '@qwik.dev/core';

export default component$(() => {
  const signedIn = useSignal(false);

  return (
    <>
      <button onClick$={() => (signedIn.value = !signedIn.value)}>
        {signedIn.value ? 'Sign out' : 'Sign in'}
      </button>

      <Show
        when$={() => signedIn.value}
        then$={() => <p>Welcome back.</p>}
        else$={() => <p>Please sign in.</p>}
      />
    </>
  );
});

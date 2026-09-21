import { component$, useContextProvider, useStore } from '@qwik.dev/core';
import { GreetingContext, LibCounter, LibLink } from 'e2e-library';

export default component$(() => {
  const greeting = useStore({ greeting: 'Hello from the app' });
  useContextProvider(GreetingContext, greeting);

  return (
    <>
      <LibCounter />
      <LibLink href="/external-library/other/">other page</LibLink>
    </>
  );
});

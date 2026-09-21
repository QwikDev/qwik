import { component$, isSignal, useContextProvider, useStore } from '@qwik.dev/core';
import { GreetingContext, LibCounter, libraryIsSignal } from 'e2e-library';

export const Root = component$(() => {
  const greeting = useStore({ greeting: 'Hello from the app' });
  useContextProvider(GreetingContext, greeting);
  // Evaluated on the server only: a second core copy means the library resolved its own core.
  const coreCopies = libraryIsSignal === isSignal ? 'shared' : 'duplicated';

  return (
    <>
      <head>
        <meta charset="utf-8" />
        <title>Qwik E2E: external library</title>
      </head>
      <body>
        <p id="core-copies">{coreCopies}</p>
        <LibCounter />
      </body>
    </>
  );
});

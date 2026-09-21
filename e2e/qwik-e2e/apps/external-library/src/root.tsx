import { component$, isSignal } from '@qwik.dev/core';
import { RouterOutlet, useQwikRouter } from '@qwik.dev/router';
import { libraryIsSignal } from 'e2e-library';

export default component$(() => {
  useQwikRouter();
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
        <RouterOutlet />
      </body>
    </>
  );
});

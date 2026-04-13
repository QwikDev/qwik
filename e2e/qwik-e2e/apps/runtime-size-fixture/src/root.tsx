import { component$ } from '@qwik.dev/core';
import { RouterOutlet, useQwikRouter } from '@qwik.dev/router';

export default component$(() => {
  useQwikRouter();

  return (
    <>
      <head>
        <meta charset="utf-8" />
        <title>runtime-size-fixture</title>
      </head>
      <body>
        <RouterOutlet />
      </body>
    </>
  );
});

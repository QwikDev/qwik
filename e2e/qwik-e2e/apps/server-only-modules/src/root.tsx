import { component$ } from '@qwik.dev/core';
import { RouterOutlet, useQwikRouter } from '@qwik.dev/router';

export default component$(() => {
  useQwikRouter();

  return (
    <body>
      <RouterOutlet />
    </body>
  );
});

import { component$ } from '@qwik.dev/core';
import { RouterOutlet, useQwikRouter } from '@qwik.dev/router';
export default component$(() => {
  useQwikRouter();
  return (
    <>
      <head>
        <title>MCP SSR</title>
      </head>
      <body>
        <RouterOutlet />
      </body>
    </>
  );
});

import { component$ } from '@qwik.dev/core';
import { RouterOutlet, useQwikRouter } from '@qwik.dev/router';
import { LogConsole } from '../../../log-console';
import './global.css';

export default component$(function Root() {
  useQwikRouter();
  return (
    <>
      <head>
        <meta charset="utf-8" />
        <title>Error handling e2e</title>
      </head>
      <body>
        <LogConsole />
        <RouterOutlet />
      </body>
    </>
  );
});

import { RouterOutlet, useQwikRouter } from '@qwik.dev/router';
import { RouterHead } from './components/router-head/router-head';
import { component$ } from '@qwik.dev/core';
import './global.css';

export default component$(function Root() {
  useQwikRouter();
  return (
    <>
      <head>
        <meta charset="utf-8" />
        <RouterHead />
      </head>
      <body>
        <RouterOutlet />
      </body>
    </>
  );
});

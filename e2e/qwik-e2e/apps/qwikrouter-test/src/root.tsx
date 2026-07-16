import { component$, useServerData } from '@qwik.dev/core';
import { RouterOutlet, useQwikRouter } from '@qwik.dev/router';
import { SomeProvider } from './components/provider/provider';
import { RouterHead } from './components/router-head/router-head';
import { LogConsole } from '../../../log-console';
import './global.css';

export default component$(function Root() {
  // Opt into view transitions via the initial URL so e2e can exercise both paths.
  const url = useServerData<string>('url');
  const viewTransition = !!url && new URL(url).searchParams.has('viewtransition');
  useQwikRouter({ viewTransition });

  return (
    <SomeProvider>
      <head>
        <meta charset="utf-8" />
        <RouterHead />
      </head>
      <body>
        <LogConsole />
        <RouterOutlet />
      </body>
    </SomeProvider>
  );
});

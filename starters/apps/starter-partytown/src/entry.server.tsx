import { renderToString, RenderToStringOptions } from '@builder.io/qwik/server';
import { partytownSnippet } from '@builder.io/partytown/integration';
import { Main } from './main';

/**
 * Entry point for server-side pre-rendering.
 *
 * @returns a promise when all of the rendering is completed.
 */
export function render(opts: RenderToStringOptions) {
  return renderToString(
    <html>
      <head>
        <meta charSet="utf-8" />
        <title>Qwik + Partytown Blank App</title>
        <script children={partytownSnippet({ debug: true })} />
      </head>
      <body>
        <Main />
        <script type="text/partytown">
          ({partyTownExampleWhichBlocksMainThreadForOneSecond.toString()})()
        </script>
      </body>
    </html>,
    {
      ...opts,
      qwikLoader: {
        events: ['click', 'keyup', 'expensiveComputationDone'],
      },
      // base: '/',
    }
  );
}

function partyTownExampleWhichBlocksMainThreadForOneSecond() {
  // Block execution for 1 second.
  const start = new Date().getTime();
  // eslint-disable-next-line no-console
  console.log('Expensive computation started at:', start);
  let end = 0;
  while (end < start + 2500) {
    end = new Date().getTime();
  }
  // eslint-disable-next-line no-console
  console.log('Expensive computation ended at:', end);
  document.dispatchEvent(new Event('expensiveComputationDone', { bubbles: true }));
}

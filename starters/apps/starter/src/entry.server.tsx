import { renderToString, RenderToStringOptions } from '@builder.io/qwik/server';
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
        <title>Qwik Blank App</title>
      </head>
      <body>
        <Main />
      </body>
    </html>,
    {
      ...opts,
      // base: '/',
    }
  );
}

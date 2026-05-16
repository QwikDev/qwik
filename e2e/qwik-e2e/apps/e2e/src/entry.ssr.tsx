import { renderToStream, type RenderToStreamOptions } from '@qwik.dev/core/server';
import { Root } from './root';
import { LogConsole } from '../../../log-console';

/**
 * Entry point for server-side pre-rendering.
 *
 * @returns A promise when all of the rendering is completed.
 */
export default function (opts: RenderToStreamOptions) {
  const url = new URL(opts.serverData!.url);
  const renderOpts: RenderToStreamOptions = {
    debug: true,
    ...opts,
    streaming:
      url.pathname === '/e2e/suspense-ooos'
        ? {
            ...opts.streaming,
            outOfOrder: { strategy: 'suspense' },
          }
        : opts.streaming,
  };

  // Render segment instead
  if (url.searchParams.has('fragment')) {
    return renderToStream(
      <>
        <LogConsole />
        <Root pathname={url.pathname} />
      </>,
      {
        containerTagName: 'container',
        // streaming: {
        //   inOrder: {
        //     buffering: 'marks',
        //   },
        // },
        qwikLoader: {
          include: url.searchParams.get('loader') === 'false' ? 'never' : 'auto',
        },
        ...renderOpts,
      }
    );
  }

  return renderToStream(
    <>
      <head>
        <meta charset="utf-8" />
        <title>Qwik Blank App</title>
      </head>
      <body>
        <LogConsole />
        <Root pathname={url.pathname} />
      </body>
    </>,
    renderOpts
  );
}

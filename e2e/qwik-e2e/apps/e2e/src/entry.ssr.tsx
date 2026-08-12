import { component$ } from '@qwik.dev/core';
import { renderToStream, type RenderToStreamOptions } from '@qwik.dev/core/server';
import { Root } from './root';
import { LogConsole } from '../../../log-console';

const FragmentRoot = component$<{ pathname: string }>(({ pathname }) => (
  <>
    <LogConsole />
    <Root pathname={pathname} />
  </>
));

const DocumentRoot = component$<{ pathname: string }>(({ pathname }) => (
  <>
    <head>
      <meta charset="utf-8" />
      <title>Qwik Blank App</title>
    </head>
    <body>
      <LogConsole />
      <Root pathname={pathname} />
    </body>
  </>
));

/**
 * Entry point for server-side pre-rendering.
 *
 * @returns A promise when all of the rendering is completed.
 */
export default function (opts: RenderToStreamOptions) {
  const url = new URL(opts.serverData!.url);
  const outOfOrderParam = url.searchParams.get('outOfOrder');
  const outOfOrderStreaming =
    outOfOrderParam === 'false' ? false : url.pathname === '/e2e/suspense-ooos' ? true : undefined;
  const renderOpts: RenderToStreamOptions = {
    debug: true,
    ...opts,
    streaming:
      outOfOrderStreaming === undefined
        ? opts.streaming
        : {
            ...opts.streaming,
            outOfOrder: outOfOrderStreaming,
          },
  };

  // Render segment instead
  if (url.searchParams.has('fragment')) {
    return renderToStream(FragmentRoot, {
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
      props: { pathname: url.pathname },
    });
  }

  return renderToStream(DocumentRoot, {
    ...renderOpts,
    props: { pathname: url.pathname },
  });
}

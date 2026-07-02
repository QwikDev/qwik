import { renderToStream, type RenderToStreamOptions } from '@qwik.dev/core/server';
import { Root } from './root';

/** Mirrors the e2e app entry: out-of-order streaming by default, `?outOfOrder=false` opts out. */
export default function (opts: RenderToStreamOptions) {
  const url = new URL(opts.serverData!.url);
  const outOfOrder = url.searchParams.get('outOfOrder') !== 'false';
  return renderToStream(
    <>
      <head>
        <meta charset="utf-8" />
        <title>Qwik EB Prod App</title>
      </head>
      <body>
        <Root />
      </body>
    </>,
    {
      debug: true,
      ...opts,
      streaming: {
        ...opts.streaming,
        outOfOrder,
      },
    }
  );
}

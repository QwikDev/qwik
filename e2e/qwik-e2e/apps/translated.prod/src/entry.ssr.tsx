import { renderToStream, type RenderToStreamOptions } from '@qwik.dev/core/server';
import { Root } from './root';

export default function (opts: RenderToStreamOptions) {
  return renderToStream(
    <>
      <head>
        <meta charset="utf-8" />
        <title>Translated</title>
      </head>
      <body>
        <Root />
      </body>
    </>,
    opts
  );
}

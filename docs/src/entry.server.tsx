import { renderToString, RenderToStringOptions, QwikLoader } from '@builder.io/qwik/server';
import { Main } from './main';
import { Head } from './components/head/head';

export function render(opts: RenderToStringOptions) {
  return renderToString(
    <html lang="en" className="h-screen">
      <head>
        <Head href={opts.url!.href} />
      </head>
      <body q:base="/">
        <Main />
        <QwikLoader />
      </body>
    </html>,
    opts
  );
}

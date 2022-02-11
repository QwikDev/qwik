import { renderToString, RenderToStringOptions, QwikLoader } from '@builder.io/qwik/server';
import { App } from './app';
import { Head } from './components/head/head';
import { PageProps } from './types';

export function render(opts: RenderToStringOptions) {
  const url = opts.url!;

  const page: PageProps = {
    url: url.href,
    pathname: url.pathname,
  };

  return renderToString(
    <html lang="en" className="h-screen">
      <head>
        <Head {...page} />
      </head>
      <body q:base="/" className="bg-gray-900 text-slate-100 antialiased h-screen">
        <App {...page} />
        <QwikLoader />
      </body>
    </html>,
    opts
  );
}

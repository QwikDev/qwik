import { renderToString, RenderToStringOptions, QwikLoader } from '@builder.io/qwik/server';
import { Main } from './main';
import { Head } from './components/head/head';

export function render(opts: RenderToStringOptions) {
  return renderToString(
    <html lang="en" className="h-screen">
      <head>
        <Head />
      </head>
      <body>
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-NR2STLN"
            height="0"
            width="0"
            style="display:none;visibility:hidden"
          />
        </noscript>
        <Main />
        <QwikLoader />
      </body>
    </html>,
    opts
  );
}

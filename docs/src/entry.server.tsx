import { renderToString, RenderToStringOptions, QwikLoader } from '@builder.io/qwik/server';
import { Main } from './main';
import { Head } from './components/head/head';

export async function renderMain(opts: RenderToStringOptions) {
  return renderToString(<Main />, opts); // <div q:container> <div q:host>...</div> </div>
}

export function render(opts: RenderToStringOptions) {
  // <html q:container> ... </html>
  return renderToString(
    <html lang="en" className="h-screen">
      <head>
        <Head />
      </head>
      <body>
        <Main />
        <QwikLoader />
      </body>
    </html>,
    opts
  );
}

// function ClientBootstrapMain() {
//   return (
//     <script
//       type="module"
//       dangerouslySetInnerHTML={`
//       import { render, jsx } from '@builder.io/qwik';
//       import { Main } from '/src/main.tsx';
//       render(document.body, jsx(Main));`}
//     />
//   );
// }

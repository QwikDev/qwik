import { component$ } from '@qwik.dev/core';
import { DocumentHeadTags, RouterOutlet, useQwikRouter } from '@qwik.dev/router';

export default component$(() => {
  useQwikRouter();

  return (
    <>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="icon" href="/favicon.ico" />
        <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
        <DocumentHeadTags />
      </head>
      <body class="m-0 bg-slate-50 font-sans text-slate-900 antialiased">
        <RouterOutlet />
      </body>
    </>
  );
});

import { component$ } from '@qwik.dev/core';
import { DocumentHeadTags, RouterOutlet, useLocation, useQwikRouter } from '@qwik.dev/router';

export default component$(() => {
  useQwikRouter();

  const loc = useLocation();

  return (
    <>
      <head>
        <meta charset="utf-8" />

        <link rel="canonical" href={loc.url.href} />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />

        <DocumentHeadTags />
      </head>
      <body>
        <RouterOutlet />
      </body>
    </>
  );
});

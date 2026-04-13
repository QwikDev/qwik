import { component$ } from '@qwik.dev/core';
import { DocumentHeadTags, RouterOutlet, useLocation, useQwikRouter } from '@qwik.dev/router';

export default component$(() => {
  useQwikRouter();
  const location = useLocation();

  return (
    <>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="canonical" href={location.url.href} />
        <DocumentHeadTags />
      </head>
      <body>
        <RouterOutlet />
      </body>
    </>
  );
});

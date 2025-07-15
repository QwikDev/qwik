import { component$ } from '@qwik.dev/core';
import { RouterOutlet, useDocumentHead, useLocation, useQwikRouter } from '@qwik.dev/router';

export default component$(() => {
  useQwikRouter();

  const head = useDocumentHead();
  const loc = useLocation();

  return (
    <>
      <head>
        <meta charset="utf-8" />
        <title>{head.title}</title>

        <link rel="canonical" href={loc.url.href} />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />

        {head.meta.map((m) => (
          <meta key={m.key} {...m} />
        ))}

        {head.links.map((l) => (
          <link key={l.key} {...l} />
        ))}
        {/* we don't use styles or scripts here */}
      </head>
      <body>
        <RouterOutlet />
      </body>
    </>
  );
});

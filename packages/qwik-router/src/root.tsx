import { component$ } from '@qwik.dev/core';
import {
  QwikRouterProvider,
  RouterOutlet,
  ServiceWorkerRegister,
  useDocumentHead,
  useLocation,
} from '@qwik.dev/router';
import { isDev } from '@qwik.dev/core/build';

/** The RouterHead component is placed inside of the document `<head>` element. */
export const RouterHead = component$(() => {
  const head = useDocumentHead();
  const loc = useLocation();

  return (
    <>
      <title>{head.title}</title>

      {/* TODO: move into app's src/routes/layout.tsx DocumentHead === */}
      <link rel="canonical" href={loc.url.href} />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      {/* end of code to move ======================================== */}

      {head.meta.map((m) => (
        <meta key={m.key} {...m} />
      ))}

      {head.links.map((l) => (
        <link key={l.key} {...l} />
      ))}

      {head.styles.map((s) => (
        <style key={s.key} {...s.props} dangerouslySetInnerHTML={s.style} />
      ))}
    </>
  );
});

export const Root = component$(() => {
  /**
   * The root of a QwikCity site always start with the <QwikCityProvider> component, immediately
   * followed by the document's <head> and <body>.
   *
   * Don't remove the `<head>` and `<body>` elements.
   */

  return (
    <QwikRouterProvider>
      <head>
        <meta charset="utf-8" />
        {/* TODO move into app's src/routes/layout.tsx DocumentHead */}
        {!isDev && <link rel="manifest" href={`${import.meta.env.BASE_URL}manifest.json`} />}
        <RouterHead />
      </head>
      <body>
        <RouterOutlet />
        {/* TODO move into app's src/routes/layout.tsx layout after Slot */}
        {!isDev && <ServiceWorkerRegister />}
      </body>
    </QwikRouterProvider>
  );
});

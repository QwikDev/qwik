import { component$ } from "@qwik.dev/core";
import {
  RouterOutlet,
  useDocumentHead,
  useLocation,
  useQwikRouter,
} from "@qwik.dev/router";

import "./global.css";

export default component$(() => {
  useQwikRouter();
  const head = useDocumentHead();
  const { url } = useLocation();

  /**
   * This is the root of a QwikRouter site. It contains the document's `<head>` and `<body>`. You can adjust them as you see fit.
   */

  return (
    <>
      <head>
        <meta charset="utf-8" />

        <title>{head.title}</title>

        <link rel="canonical" href={head.frontmatter?.canonical || url.href} />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />

        {/* The below are tags that were collected from all the `head` exports in the current route. */}
        {head.meta.map((m) => (
          <meta key={m.key} {...m} />
        ))}
        {head.links.map((l) => (
          <link key={l.key} {...l} />
        ))}
        {head.styles.map((s) => (
          <style key={s.key} {...s.props} dangerouslySetInnerHTML={s.style} />
        ))}
        {head.scripts.map((s) => (
          <script key={s.key} {...s.props} dangerouslySetInnerHTML={s.script} />
        ))}
      </head>
      <body>
        {/* This renders the current route, including all Layout components. */}
        <RouterOutlet />
      </body>
    </>
  );
});

import { component$, isDev } from "@qwik.dev/core";
import {
  DocumentHeadTags,
  QwikRouterProvider,
  RouterOutlet,
} from "@qwik.dev/router";
import { RouterHead } from "./components/router-head/router-head";

import "./global.css";

export default component$(() => {
  /**
   * The root of a QwikRouter site always start with the <QwikRouterProvider> component,
   * immediately followed by the document's <head> and <body>.
   *
   * Don't remove the `<head>` and `<body>` elements.
   */

  return (
    <QwikRouterProvider>
      <head>
        <meta charset="utf-8" />
        {!isDev && (
          <link
            rel="manifest"
            href={`${import.meta.env.BASE_URL}manifest.json`}
          />
        )}
        <DocumentHeadTags />
        <RouterHead />
      </head>
      <body>
        <RouterOutlet />
      </body>
    </QwikRouterProvider>
  );
});

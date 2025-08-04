import { component$ } from "@qwik.dev/core";
import { useLocation } from "@qwik.dev/router";

/**
 * The RouterHead component is placed inside of the document `<head>` element.
 */
export const RouterHead = component$(() => {
  const loc = useLocation();

  return (
    <>
      <link rel="canonical" href={loc.url.href} />
      <link rel="icon" type="image/svg+xml" href="/favicon.svg" />

      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    </>
  );
});

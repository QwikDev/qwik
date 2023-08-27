import { component$ } from "@builder.io/qwik";
import { useDocumentHead, useLocation } from "@builder.io/qwik-city";
import { Social } from "./social";
import { Vendor } from "./vendor";

export const RouterHead = component$(() => {
  const head = useDocumentHead();
  const loc = useLocation();

  const title = head.title ? `${head.title} - Qwik` : `Qwik`;
  return (
    <>
      <title>{title}</title>
      <link rel="canonical" href={loc.url.href} />
      <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      <meta name="viewport" content="width=device-width" />

      <Social loc={loc} head={head} />
      <Vendor loc={loc} />

      {head.meta.map((m) => (
        <meta {...m} />
      ))}

      {head.links.map((l) => (
        <link {...l} />
      ))}

      {head.styles.map((s) => (
        <style {...s.props} dangerouslySetInnerHTML={s.style} />
      ))}

      {head.scripts.map((s) => (
        <script {...s.props} dangerouslySetInnerHTML={s.script} />
      ))}
    </>
  );
});

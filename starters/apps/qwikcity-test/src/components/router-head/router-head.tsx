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

      {head.meta.map((m, idx) => {
        const { key, ...rest } = m;
        const metaKey = key ?? m.name ?? m.property ?? `meta-${idx}`;
        return <meta key={metaKey} {...rest} />;
      })}

      {head.links.map((l, idx) => {
        const { key, ...rest } = l;
        const linkKey = key ?? l.href ?? `${l.rel ?? "link"}-${idx}`;
        return <link key={linkKey} {...rest} />;
      })}

      {head.styles.map((s) => (
        <style
          key={s.key}
          {...s.props}
          {...(s.props?.dangerouslySetInnerHTML
            ? {}
            : { dangerouslySetInnerHTML: s.style })}
        />
      ))}

      {head.scripts.map((s) => (
        <script
          key={s.key}
          {...s.props}
          {...(s.props?.dangerouslySetInnerHTML
            ? {}
            : { dangerouslySetInnerHTML: s.script })}
        />
      ))}
    </>
  );
});

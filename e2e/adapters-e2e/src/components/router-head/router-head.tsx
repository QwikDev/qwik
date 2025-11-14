import { component$ } from '@builder.io/qwik';
import { useDocumentHead, useLocation } from '@builder.io/qwik-city';

export const RouterHead = component$(() => {
  const head = useDocumentHead();
  const loc = useLocation();

  return (
    <>
      <title>{head.title}</title>

      <link rel="canonical" href={loc.url.href} />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />

      {head.meta.map((m, idx) => {
        const { key, ...rest } = m;
        const metaKey = key ?? m.name ?? m.property ?? `meta-${idx}`;
        return <meta key={metaKey} {...rest} />;
      })}

      {head.links.map((l, idx) => {
        const { key, ...rest } = l;
        const linkKey = key ?? l.href ?? `${l.rel ?? 'link'}-${idx}`;
        return <link key={linkKey} {...rest} />;
      })}
    </>
  );
});

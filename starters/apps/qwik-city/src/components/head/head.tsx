import { component$ } from '@builder.io/qwik';
import { useDocumentHead, useLocation } from '@builder.io/qwik-city';

export const RouterHead = component$(() => {
  const head = useDocumentHead();
  const loc = useLocation();

  return (
    <>
      <title>{head.title ? `${head.title} - Qwik` : `Qwik`}</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <link rel="canonical" href={loc.href} />

      {head.meta.map((m) => (
        <meta {...m} />
      ))}

      {head.links.map((l) => (
        <link {...l} />
      ))}

      {head.styles.map((s) => (
        <style {...s.props} dangerouslySetInnerHTML={s.style} />
      ))}

      <Social />
    </>
  );
});

export const Social = () => {
  return (
    <>
      <meta property="og:site_name" content="Qwik" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content="@QwikDev" />
      <meta name="twitter:title" content="Qwik" />
    </>
  );
};

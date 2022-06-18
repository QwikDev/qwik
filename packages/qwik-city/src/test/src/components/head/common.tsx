import { component$ } from '@builder.io/qwik';
import { usePage } from '@builder.io/qwik-city';

export const Common = component$(() => {
  const page = usePage();
  if (!page) {
    return null;
  }

  return (
    <>
      <title>{page.head.title}</title>
      <meta property="og:site_name" content="Qwik" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content="@QwikDev" />
      <meta name="twitter:title" content="Qwik" />
    </>
  );
});

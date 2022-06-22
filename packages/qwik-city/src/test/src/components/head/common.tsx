import type { HeadComponentProps } from '@builder.io/qwik-city';

export const Common = ({ resolved }: HeadComponentProps) => {
  return (
    <>
      <title>{resolved.title} - Qwik</title>
      <meta property="og:site_name" content="Qwik" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content="@QwikDev" />
      <meta name="twitter:title" content="Qwik" />
    </>
  );
};

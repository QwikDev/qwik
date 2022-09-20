import type { ResolvedDocumentHead, RouteLocation } from '@builder.io/qwik-city';

export const Social = ({ head, loc }: SocialProps) => {
  const title = head.title;
  const desc = head.meta.find((m) => m.name === 'description')?.content;
  const img = '/logos/social.png';
  const imgAlt =
    'Image of Qwik Framework Logo, Framework reimagined for the edge. Code snippet npm create qwik@latest';

  return (
    <>
      {/*  Open Graph: https://ogp.me/  */}
      <meta property="og:url" content={loc.href} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={desc} />
      <meta property="og:image" content={img} />
      <meta property="og:image:alt" content={imgAlt} />
      <meta property="og:image:width" content="4554" />
      <meta property="og:image:height" content="2916" />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="Qwik" />
      <meta property="og:locale" content="en_US" />

      {/*  Twitter: https://developer.twitter.com/en/docs/twitter-for-websites/cards/overview/abouts-cards  */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content="@QwikDev" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={desc} />
      <meta name="twitter:image" content={img} />
      <meta name="twitter:image:alt" content={imgAlt} />

      {/*  Facebook  */}
      <meta property="fb:app_id" content="676395883130092" />
    </>
  );
};

interface SocialProps {
  loc: RouteLocation;
  head: ResolvedDocumentHead;
}

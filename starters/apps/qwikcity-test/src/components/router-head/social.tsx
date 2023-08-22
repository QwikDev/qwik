import type {
  ResolvedDocumentHead,
  RouteLocation,
} from "@builder.io/qwik-city";

export const Social = ({ head, loc }: SocialProps) => {
  return (
    <>
      {/*  Open Graph: https://ogp.me/  */}
      <meta property="og:url" content={loc.url.href} />
      <meta property="og:title" content={head.title} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="Qwik" />
      <meta property="og:locale" content="en_US" />

      {/*  Twitter: https://developer.twitter.com/en/docs/twitter-for-websites/cards/overview/abouts-cards  */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content="@QwikDev" />
      <meta name="twitter:title" content={head.title} />
    </>
  );
};

interface SocialProps {
  loc: RouteLocation;
  head: ResolvedDocumentHead;
}

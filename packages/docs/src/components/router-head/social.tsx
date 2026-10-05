export const Social = ({
  title,
  description,
  href,
  ogImage,
  ogImageAlt,
  ogImageWidth,
  ogImageHeight,
}: SocialProps) => {
  const imgAlt =
    ogImageAlt ||
    'Image of Qwik Framework Logo, Framework reimagined for the edge. Code snippet npm create qwik@latest';

  return (
    <>
      {/*  Open Graph: https://ogp.me/  */}
      <meta property="og:url" content={href} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:image:alt" content={imgAlt} />
      {ogImageWidth && (
        <meta property="og:image:width" content={ogImageWidth} />
      )}
      {ogImageHeight && (
        <meta property="og:image:height" content={ogImageHeight} />
      )}
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="Qwik" />
      <meta property="og:locale" content="en_US" />

      {/*  Twitter: https://developer.twitter.com/en/docs/twitter-for-websites/cards/overview/abouts-cards  */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content="@QwikDev" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />
      <meta name="twitter:image:alt" content={imgAlt} />

      {/*  Facebook  */}
      <meta property="fb:app_id" content="676395883130092" />
    </>
  );
};

interface SocialProps {
  title: string;
  description: string;
  href: string;
  ogImage?: string;
  ogImageAlt?: string;
  ogImageWidth?: string;
  ogImageHeight?: string;
}

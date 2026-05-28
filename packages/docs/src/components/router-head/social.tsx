import { OG_IMAGE_SIZE } from '~/utils/og-image';

export const Social = ({ title, description, href, ogImage }: SocialProps) => {
  const imgAlt = `Qwik social card for ${title}`;

  return (
    <>
      {/*  Open Graph: https://ogp.me/  */}
      <meta property="og:url" content={href} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:image:alt" content={imgAlt} />
      <meta property="og:image:width" content={OG_IMAGE_SIZE.width} />
      <meta property="og:image:height" content={OG_IMAGE_SIZE.height} />
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
}

import { component$, untrack } from '@qwik.dev/core';
import { DocumentHeadTags, useDocumentHead, useLocation } from '@qwik.dev/router';
import { Social } from './social';
import { Vendor } from './vendor';

/** The dynamic head content */
export const RouterHead = component$(() => {
  const head = useDocumentHead();
  const { url } = useLocation();
  const href = head.frontmatter?.canonical || untrack(() => url.href);

  const title = head.title
    ? `${head.title} 📚 Qwik Documentation`
    : `Qwik - Framework reimagined for the edge`;
  const description =
    head.meta.find((m) => m.name === 'description')?.content ||
    `No hydration, auto lazy-loading, edge-optimized, and fun 🎉!`;

  const OGImage = {
    imageURL: '',
    ogImgTitle: '',
    ogImgSubTitle: '' as string | undefined,

    get URL() {
      //turn the title into array with [0] -> Title [1] -> subTitle
      const arrayedTitle = title.split(' | ');
      const ogImageUrl = new URL('https://opengraphqwik.vercel.app/api/og?level=1');

      // biggerTitle
      this.ogImgTitle = arrayedTitle[0];
      //smallerTitle
      this.ogImgSubTitle = arrayedTitle[1]
        ? arrayedTitle[1].replace(' 📚 Qwik Documentation', '')
        : undefined;

      //decide whether or not to show dynamic OGimage or use docs default social card
      if (this.ogImgSubTitle == undefined || this.ogImgTitle == undefined) {
        this.imageURL = new URL(`/logos/social-card.jpg`, url).href;

        return this.imageURL;
      } else {
        ogImageUrl.searchParams.set('title', this.ogImgTitle);
        ogImageUrl.searchParams.set('subtitle', this.ogImgSubTitle);
        // ogImageUrl.searchParams.set('level', this.routeLevel.toString());

        this.imageURL = ogImageUrl.toString();

        return this.imageURL;
      }
    },
  };
  return (
    <>
      <meta name="description" content={description} />
      <link rel="canonical" href={href} />

      {import.meta.env.PROD && (
        <>
          <Social title={title} description={description} href={href} ogImage={OGImage.URL} />
          <Vendor />
        </>
      )}

      <DocumentHeadTags
        title={title}
        // Skip description because that was already added at the top
        meta={head.meta.filter((s) => s.name !== 'description')}
      />
    </>
  );
});

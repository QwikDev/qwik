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
  const pageMeta = (property: string) => head.meta.find((m) => m.property === property)?.content;
  const socialImage = new URL(
    pageMeta('og:image') || '/logos/og-image.png',
    untrack(() => url.href)
  ).href;

  return (
    <>
      <meta name="description" content={description} />
      <link rel="canonical" href={href} />

      <Social
        title={title}
        description={description}
        href={href}
        ogImage={socialImage}
        ogImageAlt={pageMeta('og:image:alt')}
      />

      {import.meta.env.PROD && (
        <>
          <Vendor />
        </>
      )}

      <DocumentHeadTags
        title={title}
        // Skip description and the social image because they were already added at the top
        meta={head.meta.filter(
          (s) => s.name !== 'description' && !s.property?.startsWith('og:image')
        )}
      />
    </>
  );
});

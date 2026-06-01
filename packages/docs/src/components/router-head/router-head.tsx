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
  const socialImage = '/logos/og-image.png';

  return (
    <>
      <meta name="description" content={description} />
      <link rel="canonical" href={href} />

      <Social title={title} description={description} href={href} ogImage={socialImage} />

      {import.meta.env.PROD && (
        <>
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

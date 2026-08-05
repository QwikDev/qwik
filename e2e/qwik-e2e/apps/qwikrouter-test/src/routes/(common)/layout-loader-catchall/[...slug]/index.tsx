import { component$, createContextId, useContext, useContextProvider } from '@qwik.dev/core';
import { Link, routeLoader$, type DocumentHead } from '@qwik.dev/router';

type PageData = {
  blockText: string;
  pageId: string;
  pathname: string;
  title: string;
};

export const useLayoutLoaderCatchallPageData = routeLoader$(
  ({ url }) => {
    const isMockDetail = url.pathname.endsWith('/mock-detail/');
    return {
      blockText: isMockDetail ? 'Mock detail content from loader' : 'Mock home content from loader',
      pageId: isMockDetail ? 'mock-detail' : 'mock-home',
      pathname: url.pathname,
      title: isMockDetail ? 'Mock Detail Loader Page' : 'Mock Home Loader Page',
    } satisfies PageData;
  },
  { serializationStrategy: 'never' }
);

export const PageDataContext = createContextId<ReturnType<typeof useLayoutLoaderCatchallPageData>>(
  'layout-loader-catchall-page-data'
);

const PageGenerator = component$(() => {
  const pageLoaded = useContext(PageDataContext);
  const page = pageLoaded.value;

  return (
    <section data-page-id={page.pageId} id="layout-loader-catchall-page">
      <h1 id="layout-loader-catchall-content">{page.blockText}</h1>
      <p id="layout-loader-catchall-pathname">{page.pathname}</p>
      <Link
        href="/qwikrouter-test/layout-loader-catchall/mock-detail/"
        id="layout-loader-catchall-detail"
      >
        Mock Detail
      </Link>
    </section>
  );
});

export default component$(() => {
  const pageLoaded = useLayoutLoaderCatchallPageData();
  useContextProvider(PageDataContext, pageLoaded);

  return <PageGenerator key={pageLoaded.value.pageId} />;
});

export const head: DocumentHead = ({ resolveValue }) => {
  const pageData = resolveValue(useLayoutLoaderCatchallPageData);

  return {
    title: pageData.title,
  };
};

import { PageHandler, setHeadMeta, setHeadLinks } from '@builder.io/qwest';
import { component$, $ } from '@builder.io/qwik';

interface QwestPageProps {
  page: PageHandler;
  pathname: string;
}

export const Page = component$(({ page, pathname }: QwestPageProps) => {
  return $(() => {
    const meta = page.getMetadata();
    const Layout = page.getLayout();
    const Content = page.getContent();

    setHeadMeta({
      title: meta.title,
      description: meta.description,
    });

    setHeadLinks([{ rel: 'canonical', href: `https://qwik.dev${pathname}` }]);

    return (
      <Layout pathname={pathname}>
        <Content />
      </Layout>
    );
  });
});

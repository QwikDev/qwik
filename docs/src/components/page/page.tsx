import { PageHandler, setHeadMeta, setHeadLinks } from '@builder.io/qwest';
import { component$, $ } from '@builder.io/qwik';

interface QwestPageProps {
  page: PageHandler;
  pathname: string;
}

export const Page = component$(({ page, pathname }: QwestPageProps) => {
  return $(() => {
    const attrs = page.getAttributes();
    const Layout = page.getLayout();
    const Content = page.getContent();

    setHeadMeta({
      title: attrs.title + ' - Qwik',
      description: attrs.description,
    });

    setHeadLinks([{ rel: 'canonical', href: pathname }]);

    return (
      <Layout pathname={pathname}>
        <Content />
      </Layout>
    );
  });
});

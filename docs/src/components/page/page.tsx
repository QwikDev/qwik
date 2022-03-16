import { PageHandler, setHeadMeta, setHeadLinks } from '@builder.io/qwest';
import { component$, $ } from '@builder.io/qwik';

interface QwestPageProps {
  page: PageHandler;
}

export const Page = component$(({ page }: QwestPageProps) => {
  return $(() => {
    const attrs = page.getAttributes();
    const Layout = page.getLayout();
    const Content = page.getContent();
    const url = page.getURL();

    setHeadMeta({
      title: attrs.title + ' - Qwik',
      description: attrs.description,
    });

    setHeadLinks([{ rel: 'canonical', href: url.href }]);

    return (
      <Layout>
        <Content />
      </Layout>
    );
  });
});

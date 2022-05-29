import { component$ } from '@builder.io/qwik';
import { useHeadMeta, usePage } from '@builder.io/qwik-city';
import NotFound from '../../layouts/not-found/not-found';

export const Page = component$(() => {
  const page = usePage();
  if (page) {
    const attrs = page.attributes;
    const Layout = page.layout;
    const Content = page.content;

    useHeadMeta({
      title: attrs.title + ' - Qwik',
      description: attrs.description,
    });

    return (
      <Layout>
        <Content />
      </Layout>
    );
  }
  return <NotFound />;
});

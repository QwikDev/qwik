import { component$, useDocument } from '@builder.io/qwik';
import { Builder } from '../../layouts/builder/builder';
import { setHeadLinks, setHeadMeta, getLocation, usePage } from '@builder.io/qwik-city';
import Playground from '../../layouts/playground/playground';
import Examples from '../../layouts/examples/examples';

export const Page = component$(() => {
  const doc = useDocument();
  const loc = getLocation(doc);

  if (loc.pathname === '/playground') {
    return <Playground />;
  }

  if (loc.pathname.startsWith('/examples/')) {
    const p = loc.pathname.split('/');
    const appId = `${p[2]}/${p[3]}`;
    return <Examples appId={appId} />;
  }

  const page = usePage();
  if (page) {
    const attrs = page.attributes;
    const Layout = page.layout;
    const Content = page.content;

    setHeadMeta(doc, {
      title: attrs.title + ' - Qwik',
      description: attrs.description,
    });

    setHeadLinks(doc, [
      { rel: 'canonical', href: new URL(page.url, 'https://qwik.builder.io/').href },
    ]);

    return (
      <Layout>
        <Content />
      </Layout>
    );
  }

  return <Builder />;
});

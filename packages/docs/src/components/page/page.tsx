import { component$, useHostElement } from '@builder.io/qwik';
import { Builder } from '../../layouts/builder/builder';
import { setHeadLinks, setHeadMeta, useLocation, usePage } from '@builder.io/qwik-city';
import type { SiteStore } from '../app/app';
import Playground from '../../layouts/playground/playground';
import Examples from '../../layouts/examples/examples';

interface PageProps {
  store: SiteStore;
}

export const Page = component$(async (props: PageProps) => {
  const hostElm = useHostElement();

  const loc = useLocation(hostElm);
  if (loc.pathname === '/playground') {
    return <Playground store={props.store} />;
  }
  if (loc.pathname === '/examples') {
    return <Examples store={props.store} />;
  }

  const page = await usePage(hostElm);
  if (page) {
    const attrs = page.attributes;
    const Layout = page.layout;
    const Content = page.content;

    setHeadMeta(hostElm, {
      title: attrs.title + ' - Qwik',
      description: attrs.description,
    });

    setHeadLinks(hostElm, [{ rel: 'canonical', href: page.url.href }]);

    return (
      <Layout store={props.store}>
        <Content store={props.store} />
      </Layout>
    );
  }

  return <Builder store={props.store} />;
});

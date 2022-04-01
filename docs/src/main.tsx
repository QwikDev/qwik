import { $, component$, Host, useHostElement, useStore } from '@builder.io/qwik';
import { Builder } from './layouts/builder/builder';
import { setHeadLinks, setHeadMeta, usePage } from '@builder.io/qwest';
import './global.css';

export interface SiteStore {
  headerMenuOpen: boolean;
  sideMenuOpen: boolean;
}

export const Main = component$(() => {
  const store = useStore<SiteStore>({
    headerMenuOpen: false,
    sideMenuOpen: false,
  });

  return $(async () => {
    const hostElm = useHostElement();
    const page = await usePage(hostElm);

    let body = <Builder store={store} />;

    if (page) {
      const attrs = page.attributes;
      const Layout = page.layout;
      const Content = page.content;

      setHeadMeta(hostElm, {
        title: attrs.title + ' - Qwik',
        description: attrs.description,
      });

      setHeadLinks(hostElm, [{ rel: 'canonical', href: page.url.href }]);
      body = (
        <Layout store={store}>
          <Content store={store} />
        </Layout>
      );
    }

    return (
      <Host
        class={{
          'header-open': store.headerMenuOpen,
          'menu-open': store.sideMenuOpen,
        }}
      >
        {body}
      </Host>
    );
  });
});

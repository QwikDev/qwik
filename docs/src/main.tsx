import { $, component$, useHostElement } from '@builder.io/qwik';
import { Builder } from './layouts/builder/builder';
import { loadPage } from '@builder.io/qwest';
import { Page } from './components/page/page';
import './global.css';

export const Main = component$(() => {
  return $(async () => {
    const host = useHostElement();
    const doc = host.ownerDocument;
    const url = new URL(doc.baseURI);

    const page = await loadPage({
      pathname: url.pathname,
    });
    if (page) {
      return <Page page={page} pathname={url.pathname} />;
    }
    return <Builder />;
  });
});

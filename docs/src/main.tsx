import { $, component$, useDocument } from '@builder.io/qwik';
import { Builder } from './layouts/builder/builder';
import { loadPage } from '@builder.io/qwest';
import { Page } from './components/page/page';
import './global.css';

export const Main = component$(() => {
  return $(async () => {
    const doc = useDocument();
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

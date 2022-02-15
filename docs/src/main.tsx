import { $, component$, useHostElement } from '@builder.io/qwik';
import { Builder } from './layouts/builder/builder';
import { getPage } from '@builder.io/qwest';

import './global.css';

export const Main = component$(() => {
  return $(async () => {
    const host = useHostElement();
    const doc = host.ownerDocument;
    const url = new URL(doc.baseURI);

    const page = await getPage({
      pathname: url.pathname,
    });

    if (page) {
      const [Layout, Content] = await Promise.all([page.getLayout(), page.getContent()]);

      if (Layout && Content) {
        return (
          <Layout pathname={url.pathname}>
            <Content />
          </Layout>
        );
      }
    }

    return <Builder pathname={url.pathname} />;
  });
});

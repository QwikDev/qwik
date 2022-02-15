import { $, component$ } from '@builder.io/qwik';
import { Builder } from './layouts/builder/builder';
import type { PageProps } from './types';
import { getPage } from '@builder.io/qwest';

import './global.css';

export const App = component$((props: PageProps) => {
  return $(async () => {
    const page = await getPage({
      pathname: props.pathname,
    });

    if (page) {
      const [Layout, Content] = await Promise.all([page.getLayout(), page.getContent()]);
      if (Layout && Content) {
        return (
          <Layout pathname={props.pathname}>
            <Content />
          </Layout>
        );
      }
    }

    return <Builder pathname={props.pathname} />;
  });
});

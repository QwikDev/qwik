import { $, component$, withStyles$ } from '@builder.io/qwik';
import { Builder } from './layouts/builder/builder';
import type { PageProps } from './types';
import styles from './app.css';
import { getPage } from '@quest';

export const App = component$((props: PageProps) => {
  withStyles$(styles);

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

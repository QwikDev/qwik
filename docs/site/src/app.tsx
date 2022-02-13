import { $, component$, withStyles$ } from '@builder.io/qwik';
import { Builder } from './layouts/builder/builder';
import type { PageProps } from './types';
import styles from './app.css';
import { getContents, getLayout } from './utils/get-content';

export const App = component$(async (props: PageProps) => {
  withStyles$(styles);

  return $(async () => {
    const contents = getContents();
    const pathname = props.pathname.substring(1);
    const content = contents.find((c) => c.name === pathname);
    if (content) {
      const contentModule = await content.module();
      const Layout = await getLayout(contentModule.layout);

      const Page = contentModule.default;
      return (
        <Layout>
          <Page />
        </Layout>
      );
    }

    return <Builder pathname={props.pathname} />;
  });
});

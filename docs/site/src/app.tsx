import { $, component$, withStyles$ } from '@builder.io/qwik';
import { Builder } from './layouts/builder/builder';
import type { PageProps } from './types';
import styles from './app.css';
import { getContents } from './utils/get-content';

export const App = component$(async (props: PageProps) => {
  withStyles$(styles);

  let page = Builder;
  let pageProps = {};

  const contents = getContents();
  const content = contents.find((c) => c.name === props.pathname);
  if (content) {
    const contentModule = await content.module();
    Page = contentModule.default;
  }

  return $(async () => {
    return <Builder />;
  });
});

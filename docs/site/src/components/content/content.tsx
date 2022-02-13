import { $, component, Host, withStyles$, $ } from '@builder.io/qwik';
import { DocsProps } from '../../pages/docs/docs';
import { OnThisPage } from '../on-this-page/on-this-page';
import styles from './content.css';

export const getDocs = () => {
  const modules = import.meta.glob('../../../../*.mdx');
  return Object.fromEntries(
    Object.entries(modules).map(([key, fn]) => {
      return [key.toLowerCase().split('/').pop()?.slice(0, -4), fn] as [string, Function];
    })
  );
};

export const Content = component(
  'section',
  $(async (props: DocsProps) => {
    withStyles$(styles);

    const docs = getDocs();
    const fn = docs[props.doc];
    const Markdown = fn ? (await fn()).default : undefined;
    return $(() => (
      <Host class="content">
        {Markdown ? (
          <>
            <article class="article-md">
              <Markdown />
            </article>
            <OnThisPage />
          </>
        ) : (
          <div>doc not found</div>
        )}
      </Host>
    ));
  })
);

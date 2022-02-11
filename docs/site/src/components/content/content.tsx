import { onRender$, component, Host, withStyles$, $ } from '@builder.io/qwik';
import { DocsProps } from '../../pages/docs/docs';
import { OnThisPage } from '../on-this-page/on-this-page';
import styles from './content.css';

export const getDocs = () => {
  const modules = import.meta.glob('../../../../*.md');
  return Object.fromEntries(
    Object.entries(modules).map(([key, fn]) => {
      return [key.toLowerCase().split('/').pop()?.slice(0, -3), fn] as [string, Function];
    })
  );
};

export const Content = component(
  'section',
  $(async (props: DocsProps) => {
    withStyles$(styles);

    const docs = getDocs();
    const fn = docs[props.doc];
    let html = fn ? (await fn()).html : undefined;
    return onRender$(() => (
      <Host class="content">
        {html ? (
          <>
            <article class="article-md" innerHTML={html} />
            <OnThisPage />
          </>
        ) : (
          <div>doc not found</div>
        )}
      </Host>
    ));
  })
);

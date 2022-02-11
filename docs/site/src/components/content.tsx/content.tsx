import { onRender$, component, Host, withStyles$, $ } from '@builder.io/qwik';
import { OnThisPage } from '../on-this-page/on-this-page';
import styles from './mdx-content.css';

export const Content = component(
  'section',
  $(() => {
    withStyles$(styles);

    return onRender$(() => (
      <Host class="content">
        <article>
          <h1>Docs! </h1>
          <p>content content content</p>
          <p>content content content</p>
          <p>content content content</p>
          <p>content content content</p>
        </article>
        <OnThisPage />
      </Host>
    ));
  })
);

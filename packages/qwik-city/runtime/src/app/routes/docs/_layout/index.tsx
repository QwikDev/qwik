import { component$, Host, Slot, useStyles$ } from '@builder.io/qwik';
import type { HeadComponent } from 'packages/qwik-city/runtime';
import styles from './docs.css';

export default component$(() => {
  useStyles$(styles);

  return (
    <Host class="docs">
      <aside class="docs-menu">
        <ul>
          <li>
            <a href="/docs/introduction">Introduction</a>
          </li>
          <li>
            <a href="/docs/getting-started">Getting Started</a>
          </li>
          <li>
            <a href="/docs/components/basics">Components</a>
          </li>
          <li>
            <a href="/">Home</a>
          </li>
        </ul>
      </aside>
      <section class="docs-content">
        <Slot />
      </section>
    </Host>
  );
});

export const head: HeadComponent = ({ resolved }) => {
  return (
    <>
      <title>Docs: {resolved.title}</title>
    </>
  );
};

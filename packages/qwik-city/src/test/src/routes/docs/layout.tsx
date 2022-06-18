import { component$, Host, Slot } from '@builder.io/qwik';
import type { PageHeadFunction } from 'packages/qwik-city/src/runtime/types';

export default component$(() => {
  return (
    <Host class="docs">
      <aside class="docs-menu">
        <ul>
          <li>
            <a href="/docs">Docs</a>
          </li>
          <li>
            <a href="/docs/introduction">Introduction</a>
          </li>
          <li>
            <a href="/docs/introduction/getting-started">Getting Started</a>
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

export const head: PageHeadFunction = ({ route }) => {
  return {
    title: `Docs: ${route.pathname}`,
  };
};

import { component$, Host, Slot, useScopedStyles$ } from '@builder.io/qwik';
import type { DocumentHead } from '@builder.io/qwik-city';
import styles from './api.css?inline';

export default component$(() => {
  useScopedStyles$(styles);

  return (
    <Host data-test-layout="api" class="api">
      <aside class="api-menu">
        <h2>API</h2>
        <ul>
          <li>
            <a href="/api/builder.io/oss.json" data-test-link="api-org-user">
              Org/User
            </a>
          </li>
          <li>
            <a href="/api/data.json" data-test-link="api-data">
              Data
            </a>
          </li>
        </ul>
      </aside>
      <section class="api-content">
        <Slot />
      </section>
    </Host>
  );
});

export const head: DocumentHead = ({ pathname }) => {
  return {
    title: `API: ${pathname}`,
  };
};

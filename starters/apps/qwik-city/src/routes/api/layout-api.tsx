import { component$, Slot, useStyles$ } from '@builder.io/qwik';
import type { DocumentHead } from '@builder.io/qwik-city';
import styles from './api.css?inline';

/**
 * Named layout `foo`
 * Any index files named `index@foo.tsx` will use this layout
 */

export default component$(() => {
  useStyles$(styles);

  return (
    <div class="api">
      <aside class="api-menu">
        <h2>API</h2>
        <ul>
          <li>
            <a href="/api/builder.io/oss.json">Org/User</a>
          </li>
          <li>
            <a href="/api/data.json">Data</a>
          </li>
        </ul>
      </aside>
      <section class="api-content">
        <Slot />
      </section>
    </div>
  );
});

export const head: DocumentHead = ({ pathname }) => {
  return {
    title: `API: ${pathname}`,
  };
};

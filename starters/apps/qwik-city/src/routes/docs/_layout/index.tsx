import { component$, Host, Slot, useStyles$ } from '@builder.io/qwik';
import type { DocumentHead } from '@builder.io/qwik-city';
import { Menu } from '../../../components/menu/menu';
import styles from './docs.css?inline';

export default component$(() => {
  useStyles$(styles);

  return (
    <Host class="docs">
      <Menu />
      <section class="docs-content">
        <Slot />
      </section>
    </Host>
  );
});

export const head: DocumentHead = ({ head }) => {
  return {
    title: `Docs: ${head.title}`,
  };
};

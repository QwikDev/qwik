import { component$, Host, Slot, useStyles$ } from '@builder.io/qwik';
import type { HeadComponent } from '@builder.io/qwik-city';
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

export const head: HeadComponent = ({ resolved }) => {
  return (
    <>
      <title>Docs: {resolved.title}</title>
    </>
  );
};

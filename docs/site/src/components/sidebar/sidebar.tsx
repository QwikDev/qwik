import { onRender$, component, Host, withStyles$, $ } from '@builder.io/qwik';
import styles from './sidebar.css';

export const SideBar = component(
  'aside',
  $(() => {
    withStyles$(styles);

    return onRender$(() => (
      <Host>
        <nav>
          <h1>left menu</h1>
        </nav>
      </Host>
    ));
  })
);

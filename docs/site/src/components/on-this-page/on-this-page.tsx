import { onRender$, component, Host, withStyles$, $ } from '@builder.io/qwik';
import styles from './on-this-page.css';

export const OnThisPage = component(
  'aside',
  $(() => {
    withStyles$(styles);

    return onRender$(() => (
      <Host class="on-this-page">
        <nav>
          <h2>On This Page</h2>
          <ul>
            <li>Overview</li>
          </ul>
        </nav>
      </Host>
    ));
  })
);

import { $, component, Host, useStyles$, $ } from '@builder.io/qwik';
import styles from './on-this-page.css';

export const OnThisPage = component(
  'aside',
  $(() => {
    useStyles$(styles);

    return $(() => (
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

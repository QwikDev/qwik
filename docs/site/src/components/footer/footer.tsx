import { onRender$, component, Host, withStyles$, $ } from '@builder.io/qwik';
import styles from './footer.css';

export const Footer = component(
  'footer',
  $(() => {
    withStyles$(styles);

    return onRender$(() => (
      <Host>
        <nav>
          <a href="https://github.com/BuilderIO/qwik" target="_blank">
            Github
          </a>
        </nav>
      </Host>
    ));
  })
);

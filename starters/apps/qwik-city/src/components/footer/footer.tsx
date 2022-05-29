import { component$, Host, useScopedStyles$ } from '@builder.io/qwik';
import styles from './footer.css?inline';

export const Footer = component$(
  () => {
    useScopedStyles$(styles);

    return (
      <Host>
        <div>
          <span>Made with ♡ by the </span>
          <a href="https://www.builder.io/">Builder.io</a>
          <span> team</span>
        </div>
      </Host>
    );
  },
  { tagName: 'footer' }
);

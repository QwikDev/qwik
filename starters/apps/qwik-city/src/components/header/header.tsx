import { component$, Host, useScopedStyles$ } from '@builder.io/qwik';
import styles from './header.css?inline';

export const Header = component$(
  () => {
    useScopedStyles$(styles);

    return (
      <Host>
        <div class="header-inner">
          <div className="header-logo">
            <a href="/">
              <h1>Your Qwikcity site</h1>
            </a>
          </div>
        </div>
      </Host>
    );
  },
  { tagName: 'header' }
);

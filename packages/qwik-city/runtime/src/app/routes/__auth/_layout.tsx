import { component$, Host, Slot, useScopedStyles$ } from '@builder.io/qwik';
import styles from './_layout.css';

export default component$(() => {
  useScopedStyles$(styles);

  return (
    <Host class="auth">
      <section class="auth-content">
        <Slot />
      </section>
      <aside class="auth-menu">
        <h3>Account Help</h3>
        <ul>
          <li>Forgot password</li>
        </ul>
      </aside>
    </Host>
  );
});

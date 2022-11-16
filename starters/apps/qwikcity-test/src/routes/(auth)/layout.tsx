import { component$, Slot, useStyles$ } from '@builder.io/qwik';
import styles from './layout.css?inline';

export default component$(() => {
  useStyles$(styles);

  return (
    <div class="auth" data-test-layout="auth">
      <section class="auth-content">
        <Slot />
      </section>
      <aside class="auth-menu">
        <h3>Account Help</h3>
        <ul>
          <li>Forgot password</li>
        </ul>
      </aside>
    </div>
  );
});

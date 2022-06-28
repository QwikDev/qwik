import { component$, Host, Slot } from '@builder.io/qwik';

export default component$(() => {
  return (
    <Host>
      <section>
        <Slot />
      </section>
      <aside>
        <p>Account Help</p>
        <ul>
          <li>Forgot password</li>
        </ul>
      </aside>
    </Host>
  );
});

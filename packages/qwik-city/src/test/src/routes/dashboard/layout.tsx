import { component$, Host, Slot } from '@builder.io/qwik';

export default component$(() => {
  return (
    <Host class="dashboard">
      <aside class="dashboard-menu">Dashboard Menu</aside>
      <section class="dashboard-content">
        <Slot />
      </section>
    </Host>
  );
});

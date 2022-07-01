import { component$, Host, Slot } from '@builder.io/qwik';

export default component$(() => {
  return (
    <Host>
      <section class="blog-content">
        <Slot />
      </section>
      <aside class="blog-menu">
        <ul>
          <li>
            <a href="/blog/how-to-use-a-toaster">How to use a toaster</a>
          </li>
          <li>
            <a href="/blog/how-to-crack-an-egg">How to crack an egg</a>
          </li>
        </ul>
      </aside>
    </Host>
  );
});

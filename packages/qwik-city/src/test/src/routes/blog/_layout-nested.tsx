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
            <a href="/blog">Blogs</a>
          </li>
        </ul>
      </aside>
    </Host>
  );
});

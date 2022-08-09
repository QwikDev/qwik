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
            <a href="/blog/what-is-resumability">What Is Resumability?</a>
          </li>
          <li>
            <a href="/blog/serializing-props">Serializing Props</a>
          </li>
        </ul>
      </aside>
    </Host>
  );
});

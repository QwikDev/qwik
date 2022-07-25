import { component$, Host, Slot } from '@builder.io/qwik';

export default component$(() => {
  return (
    <Host data-test-layout="blog">
      <section class="blog-content">
        <Slot />
      </section>
      <aside class="blog-menu">
        <ul>
          <li>
            <a href="/blog/what-is-resumability" data-test-link="blog-resumability">
              What Is Resumability?
            </a>
          </li>
          <li>
            <a href="/blog/serializing-props" data-test-link="blog-serializing-props">
              Serializing Props
            </a>
          </li>
        </ul>
      </aside>
    </Host>
  );
});

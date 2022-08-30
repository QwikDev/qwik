import { component$, Slot } from '@builder.io/qwik';
import { Link } from '~qwik-city-runtime';

export default component$(() => {
  return (
    <div data-test-layout="blog">
      <section class="blog-content">
        <Slot />
      </section>
      <aside class="blog-menu">
        <ul>
          <li>
            <Link href="/blog/what-is-resumability" data-test-link="blog-resumability">
              What Is Resumability?
            </Link>
          </li>
          <li>
            <Link href="/blog/serializing-props" data-test-link="blog-serializing-props">
              Serializing Props
            </Link>
          </li>
        </ul>
      </aside>
    </div>
  );
});

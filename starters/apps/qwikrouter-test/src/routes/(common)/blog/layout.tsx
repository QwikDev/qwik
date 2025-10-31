import { component$, Slot } from "@qwik.dev/core";
import { Link } from "@qwik.dev/router";

export default component$(() => {
  return (
    <div data-test-layout="blog">
      <section class="blog-content">
        <Slot />
      </section>
      <aside class="blog-menu">
        <ul>
          <li>
            <Link
              // note missing / at the end of the href
              href="/qwikrouter-test/blog/what-is-resumability"
              data-test-link="blog-resumability"
            >
              What Is Resumability?
            </Link>
          </li>
          <li>
            <Link
              href="/qwikrouter-test/blog/serializing-props/"
              data-test-link="blog-serializing-props"
            >
              Serializing Props
            </Link>
          </li>
        </ul>
      </aside>
    </div>
  );
});

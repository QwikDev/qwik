import { component$, useStylesScoped$ } from "@qwik.dev/core";
import { Link } from "@qwik.dev/router";

export default component$(() => {
  useStylesScoped$(`
    .spacer {
      height: 1000px;
    }
  `);
  return (
    <div>
      <h1>Hash</h1>
      <Link id="hash-1" class="hash-link" href="#hash-2">
        To Hash 2
      </Link>
      <div class="spacer" />
      <Link id="hash-2" class="hash-link" href="#hash-1">
        To Hash 1
      </Link>
      <div class="spacer" />
      <Link
        id="no-hash"
        class="hash-link"
        href="/qwikrouter-test/scroll-restoration/hash/"
      >
        To No Hash
      </Link>
    </div>
  );
});

import { component$ } from "@qwik.dev/core";
import { Link } from "@qwik.dev/router";

export default component$(() => (
  <div>
    <p>
      <Link id="link" href="/qwikrouter-test/issue4502/broken">
        Link
      </Link>
    </p>
    <p>
      <a id="anchor" href="/qwikrouter-test/issue4502/broken">
        Anchor
      </a>
    </p>
  </div>
));

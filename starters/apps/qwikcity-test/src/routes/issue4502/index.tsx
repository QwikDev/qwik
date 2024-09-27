import { Link } from "@qwikdev/city";
import { component$ } from "@qwikdev/core";

export default component$(() => (
  <div>
    <p>
      <Link id="link" href="/qwikcity-test/issue4502/broken">
        Link
      </Link>
    </p>
    <p>
      <a id="anchor" href="/qwikcity-test/issue4502/broken">
        Anchor
      </a>
    </p>
  </div>
));

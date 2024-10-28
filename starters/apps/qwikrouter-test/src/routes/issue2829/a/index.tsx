import { component$ } from "@qwik.dev/core";
import { Link } from "@qwik.dev/router";

export default component$(() => {
  return (
    <div>
      <Link id="issue2829-link" href="/qwikrouter-test/issue2829/b/">
        Issue 2829
      </Link>
    </div>
  );
});

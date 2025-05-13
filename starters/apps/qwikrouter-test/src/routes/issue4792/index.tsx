import { Link } from "@qwik.dev/router";
import { component$ } from "@qwik.dev/core";

export default component$((props) => {
  return (
    <div>
      <h1>Issue 4792</h1>
      <p>link with attr `reload` was not refreshing the page</p>
      <Link id="reload" reload={true} href="docs">
        reload the page
      </Link>
    </div>
  );
});

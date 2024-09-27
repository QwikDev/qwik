import { Link } from "@qwikdev/city";
import { component$ } from "@qwikdev/core";

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

import { component$ } from "@qwik.dev/core";
import { Link } from "@qwik.dev/router";

export default component$(() => {
  return (
    <div>
      <h1>Location Path id</h1>
      <Link href="/qwikrouter-test/location-path/" id="location-path-link-root">
        Location Path
      </Link>
    </div>
  );
});

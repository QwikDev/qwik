import { component$ } from "@qwik.dev/core";
import { Link } from "@qwik.dev/router";

export default component$(() => {
  return (
    <div>
      <h1>Location Path Root</h1>
      <Link href="/qwikrouter-test/location-path/1" id="location-path-link">
        Location Path 1
      </Link>
    </div>
  );
});

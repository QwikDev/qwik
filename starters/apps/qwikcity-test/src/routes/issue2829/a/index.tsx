import { Link } from "@qwik.dev/city";
import { component$ } from "@qwik.dev/core";

export default component$(() => {
  return (
    <div>
      <Link id="issue2829-link" href="/qwikcity-test/issue2829/b/">
        Issue 2829
      </Link>
    </div>
  );
});

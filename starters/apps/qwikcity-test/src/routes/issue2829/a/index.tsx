import { component$ } from "@builder.io/qwik";
import { Link } from "@builder.io/qwik-city";

export default component$(() => {
  return (
    <div>
      <Link id="issue2829-link" href="/qwikcity-test/issue2829/b/">
        Issue 2829
      </Link>
    </div>
  );
});

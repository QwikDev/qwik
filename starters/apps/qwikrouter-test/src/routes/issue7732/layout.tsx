import { component$, Slot } from "@qwik.dev/core";
import { Link } from "@qwik.dev/router";

export default component$(() => {
  return (
    <>
      <div style={{ display: "flex", gap: "10px" }}>
        <Link href="/qwikrouter-test/issue7732/a/" id="issue7732-link-a">
          A
        </Link>

        <Link
          href="/qwikrouter-test/issue7732/b/?shouldOverrideRedirect=no"
          id="issue7732-link-b"
        >
          B
        </Link>
        <Link href="/qwikrouter-test/issue7732/c/" id="issue7732-link-c">
          C
        </Link>
      </div>
      <Slot />
    </>
  );
});

import { component$, Slot } from "@builder.io/qwik";
import { Link } from "@builder.io/qwik-city";

export default component$(() => {
  return (
    <>
      <div style={{ display: "flex", gap: "10px" }}>
        <Link href="/issue7732/a/" id="issue7732-link-a">
          A
        </Link>

        <Link
          href="/qwikcity-test/issue7732/b/?shouldOverrideRedirect=no"
          id="issue7732-link-b"
        >
          B
        </Link>
        <Link href="/issue7732/c/" id="issue7732-link-c">
          C
        </Link>
      </div>
      <Slot />
    </>
  );
});

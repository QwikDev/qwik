import { Link, useLocation } from "@qwik.dev/city";
import { component$ } from "@qwik.dev/core";

export default component$(() => {
  const loc = useLocation();
  return (
    <div>
      <h1>id {loc.params.id}</h1>
      <Link id="pn-main" href="../">
        Go up
      </Link>
    </div>
  );
});

import { Link, useLocation } from "@qwikdev/city";
import { component$ } from "@qwikdev/core";

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

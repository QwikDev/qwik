import { Link, useLocation } from "@builder.io/qwik-city";
import { component$ } from "@builder.io/qwik";

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

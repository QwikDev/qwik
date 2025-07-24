import { useLocation } from "@qwik.dev/router";
import { component$ } from "@qwik.dev/core";

export default component$(() => {
  const location = useLocation();

  return (
    <div>
      <h1>
        Should <strong>not</strong> have searchParams
      </h1>
      <pre>{JSON.stringify(location.url.searchParams.get("id"))}</pre>
    </div>
  );
});

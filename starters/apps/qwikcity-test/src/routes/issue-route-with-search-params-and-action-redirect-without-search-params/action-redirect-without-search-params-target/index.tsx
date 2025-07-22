import { useLocation } from "@builder.io/qwik-city";
import { component$ } from "@builder.io/qwik";

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

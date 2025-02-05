import { useLocation } from "@qwik.dev/router";
import { component$, useStore, useTask$ } from "@qwik.dev/core";

export default component$((props) => {
  const loc = useLocation();
  const state = useStore({ id: "" });
  useTask$(({ track }) => {
    track(() => loc.url.searchParams);
    state.id = loc.url.searchParams.get("id") || "";
  });
  return (
    <div>
      <h1>Issue 4956</h1>
      <div id="routeId">{state.id}</div>
    </div>
  );
});

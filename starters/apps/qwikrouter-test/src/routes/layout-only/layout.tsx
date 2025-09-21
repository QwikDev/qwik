import { routeLoader$ } from "@qwik.dev/router";
import { component$, Slot } from "@qwik.dev/core";

const useSomeLayoutData = routeLoader$(async () => {
  return {
    someData: "some data",
  };
});

export default component$(() => {
  const someData = useSomeLayoutData();

  return (
    <div>
      <h1>Layout</h1>
      <p>{someData.value.someData}</p>
      <Slot />
    </div>
  );
});

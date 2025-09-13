import { Slot, component$, useTask$ } from "@qwik.dev/core";
import { useLocation } from "@qwik.dev/router";

export default component$(() => {
  const location = useLocation();

  useTask$(({ track }) => {
    const id = track(() => location.params.id);
    if (id === undefined) {
      // should not happen
      throw new Error("id is undefined");
    }
    // eslint-disable-next-line no-console
    console.log("location path id", id);
  });
  return (
    <div style="background-color: red">
      <Slot />
    </div>
  );
});

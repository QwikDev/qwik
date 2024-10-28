import { routeLoader$ } from "@qwik.dev/router";
import { component$, useSignal } from "@qwik.dev/core";

export const neverUsed = routeLoader$(() => {
  // console.log('neverUsed');
  return ["SHOULD NOT BE SERIALIZED"];
});

export const useUsed = routeLoader$(() => {
  // console.log('used');

  return ["USED, but not serialized"];
});

export default component$(() => {
  const data = useUsed();
  const signal = useSignal(0);
  return (
    <div class="actions">
      <button onClick$={() => signal.value++}>{signal.value}</button>
      {data.value.map((item) => (
        <div>{item}</div>
      ))}
    </div>
  );
});

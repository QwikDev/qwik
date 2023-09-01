import { component$ } from "@builder.io/qwik";
import { routeLoader$ } from "@builder.io/qwik-city";
import ActionForm from "./action";

export const useRealDateLoader = routeLoader$(() => {
  return [new Date().toISOString()];
});

export default component$(() => {
  const date = useRealDateLoader();
  return (
    <div>
      <p id="real-date">real-date: {date.value[0]}</p>
      <ActionForm />
    </div>
  );
});

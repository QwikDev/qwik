import { component$ } from "@builder.io/qwik";
import { ActionStandalone } from "../../../../components/action/action";

export default component$(() => {
  return (
    <div>
      <h1>Test</h1>
      <ActionStandalone />
    </div>
  );
});

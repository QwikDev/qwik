import { component$ } from "@qwikdev/core";
import { ActionStandalone } from "../../../../components/action/action";

export default component$(() => {
  return (
    <div>
      <h1>Test</h1>
      <ActionStandalone />
    </div>
  );
});

import { component$, useSignal } from "@qwik.dev/core";
import Dynamic1 from "./dynamic1";

export default component$(() => {
  const showDynamic = useSignal(false);
  return (
    <>
      <button
        onClick$={() => {
          showDynamic.value = true;
          // eslint-disable-next-line no-console
          console.log(
            `
************************************************
************************************************
************************************************
************************************************
************************************************
SHOW DYNAMIC CLICKED
************************************************
************************************************
************************************************
************************************************
************************************************
`,
          );
        }}
      >
        Show dynamic
      </button>
      {showDynamic.value ? <Dynamic1 /> : <p>Not yet</p>}
    </>
  );
});

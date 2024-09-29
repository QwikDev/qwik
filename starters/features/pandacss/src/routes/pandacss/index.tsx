import { component$ } from "@qwik.dev/core";
import { css } from "~/styled-system/css";

export default component$(() => {
  return (
    <div
      class={css({
        padding: 10,
        bg: "red.400",
        height: "dvh",
        margin: 100,
        fontSize: 30,
      })}
    >
      This box is styled with PandaCSS.
    </div>
  );
});

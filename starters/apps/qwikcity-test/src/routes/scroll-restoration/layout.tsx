import { component$, Slot, useStyles$ } from "@qwikdev/core";

export default component$(() => {
  useStyles$(`
    .nav-link {
      position: fixed;
      top: 0;
      right: 0;
      z-index: 1;
    }
  `);
  return <Slot />;
});

import type { RequestEvent } from "@qwik.dev/router";
import { component$, Slot, useStyles$ } from "@qwik.dev/core";
import styles from "./layout.css?inline";

export const onGet = ({ headers }: RequestEvent) => {
  headers.set("cache-control", "no-cache");
};

export default component$(() => {
  useStyles$(styles);

  return (
    <div class="auth" data-test-layout="auth">
      <section class="auth-content">
        <Slot />
      </section>
      <aside class="auth-menu">
        <h3>Account Help</h3>
      </aside>
    </div>
  );
});

import type { RequestEvent } from "@qwikdev/city";
import { component$, Slot, useStyles$ } from "@qwikdev/core";
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

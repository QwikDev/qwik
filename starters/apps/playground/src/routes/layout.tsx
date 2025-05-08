import type { RequestHandler } from "@qwik.dev/router";
import { routeLoader$ } from "@qwik.dev/router";
import { component$, Slot, useStyles$ } from "@qwik.dev/core";

import Footer from "../components/starter/footer/footer";
import Header from "../components/starter/header/header";

import styles from "./styles.css?inline";

export const useServerTimeLoader = routeLoader$(() => {
  return {
    date: new Date().toISOString(),
  };
});

export default component$(() => {
  useStyles$(styles);
  return (
    <>
      <Header />
      <main>
        <Slot />
      </main>
      <Footer />
    </>
  );
});

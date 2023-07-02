import "./styles.css";

import { Slot, component$ } from "@builder.io/qwik";

import Header from "../header";

type LayoutProps = {
  mode?: "default" | "bright";
};

export default component$<LayoutProps>(({ mode = "default" }) => {
  return (
    <>
      <Header />
      <main class={{ section: true, bright: mode === "bright" }}>
        <Slot />
      </main>
      <footer>footer</footer>
    </>
  );
});

import { component$, Slot } from "@qwik.dev/core";
import Footer from "../../components/footer/footer";
import Header from "../../components/header/header";

export const isNull = null;

export default component$(() => {
  return (
    <div data-test-layout="root">
      <Header />
      <main>
        <Slot />
      </main>
      <Footer />
    </div>
  );
});

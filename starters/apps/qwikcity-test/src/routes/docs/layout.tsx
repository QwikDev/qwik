import { component$, Slot, useStyles$ } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import { Breadcrumbs } from "../../components/breadcrumbs/breadcrumbs";
import { ContentNav } from "../../components/content-nav/content-nav";
import Footer from "../../components/footer/footer";
import Header from "../../components/header/header";
import { Menu } from "../../components/menu/menu";
import styles from "./layout.css?inline";

export default component$(() => {
  useStyles$(styles);

  return (
    <div class="docs full-screen" data-test-layout="docs">
      <Header />
      <main>
        <Menu />
        <section class="docs-content">
          <Breadcrumbs />
          <Slot />
          <ContentNav />
          <Footer />
        </section>
      </main>
    </div>
  );
});

export const head: DocumentHead = ({ head }) => {
  return {
    title: `Docs: ${head.title}`,
  };
};

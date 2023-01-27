import { component$, Slot, useStyles$, useStylesScoped$ } from "@builder.io/qwik";
import styles from "./styles.css?inline";
import stylesScoped from "./styles-scoped.css?inline";
import "./global.css";
import mod from "./styles.module.css";


export default component$(() => {

  useStyles$(styles);
  useStylesScoped$(stylesScoped);
  useStyles$(`
    .inlined-red {
      color: red;
    }
  `);
  useStylesScoped$(`
    .scoped-inlined-red {
      color: red;
    }
  `);

  return (
    <>
      <div class="inlined-red">Should be red</div>
      <div class="scoped-inlined-red">Should be red</div>
      <div class="global-red">Should be red</div>
      <div class="styles-red">Should be red</div>
      <div class="styles-scoped-red">Should be red</div>
      <div class={mod.moduleRed}>Should be red</div>
    </>
  );
});

export const Span = component$((props) => {
  return <span {...props}>
    <Slot/>
  </span>;
});

import { component$, useStyles$ } from "@qwik.dev/core";
import sharedStyles from "./use-styles-shared.css?inline";

export const UseStylesChild = component$(() => {
  useStyles$(sharedStyles);

  return <div class="use-styles-dedupe-text">Inline styles fixture child</div>;
});

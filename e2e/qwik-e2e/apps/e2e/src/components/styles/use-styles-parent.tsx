import { component$, useStyles$ } from '@qwik.dev/core';
import sharedStyles from './use-styles-shared.css?inline';
import { UseStylesChild } from './use-styles-child';

export const UseStylesParent = component$(() => {
  useStyles$(sharedStyles);

  return (
    <section id="use-styles-dedupe">
      <div class="use-styles-dedupe-text">Inline styles fixture parent</div>
      <UseStylesChild />
    </section>
  );
});

import { Slot, component$, useStylesScoped$ } from '@builder.io/qwik';
import styles from './infobox.css?inline';

export default component$(() => {
  useStylesScoped$(styles);
  return (
    <div class="infobox">
      <h3>
        <Slot name="title" />
      </h3>
      <Slot />
    </div>
  );
});

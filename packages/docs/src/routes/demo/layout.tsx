import { component$, Slot } from '@builder.io/qwik';
import { useStyles$ } from '@builder.io/qwik';
import STYLES from './demo-reset.css?inline';

export default component$(() => {
  useStyles$(STYLES);
  return (
    <demo>
      <Slot />
    </demo>
  );
});

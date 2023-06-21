import { component$ } from '@builder.io/qwik';
import { css } from '~/styled-system/css';

export default component$(() => {
  return (
    <div class={css({ p: '10', bg: 'gray.900', h: 'dvh' })}>
      <Slot />
    </div>
  );
});

import { component$, Slot, useStyles$ } from '@qwik.dev/core';
import { DocsShell } from '../docs/layout';
import apiStyles from './api.css?inline';

export default component$(() => {
  useStyles$(apiStyles);

  return (
    <DocsShell class="api" pagefindWeight={0.5}>
      <Slot />
    </DocsShell>
  );
});

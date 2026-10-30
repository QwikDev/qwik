import { component$, Slot, useStyles$ } from '@qwik.dev/core';
import { DocsShell } from '../docs/layout';
import apiStyles from './api.css?inline';

export default component$(() => {
  useStyles$(apiStyles);

  return (
    // scripts/build-search-index.ts indexes API pages per symbol instead.
    <DocsShell class="api" excludeFromSearch>
      <Slot />
    </DocsShell>
  );
});

import { createContextId, type ReadonlySignal } from '@qwik.dev/core';

export const TotalContext = createContextId<{ total: ReadonlySignal<number> }>(
  'tasks.callback-reading-a-computed'
);

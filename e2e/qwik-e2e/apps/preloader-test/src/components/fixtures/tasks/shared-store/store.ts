import { createContextId } from '@qwik.dev/core';

export type SharedStore = { a: number; b: number };

export const SharedStoreContext = createContextId<SharedStore>('tasks.shared-store');

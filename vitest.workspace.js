/** Needed by the vscode vitest integration but it also speeds up vitest cli */
import { defineWorkspace } from 'vitest/config';
import { join } from 'node:path';

export default defineWorkspace([
  // For some reason vitest cli doesn't pick up the config in the root
  join(process.cwd(), 'vitest.config.mts'),
]);

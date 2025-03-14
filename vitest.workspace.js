import { defineWorkspace } from 'vitest/config';

// needed by the vscode vitest integration but it also speeds up vitest cli
export default defineWorkspace(['./vitest.config.ts']);

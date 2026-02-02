import { vi } from 'vitest';

// stub QWIK_BACKPATCH_EXECUTOR_MINIFIED and QWIK_BACKPATCH_EXECUTOR_DEBUG for testing
vi.hoisted(() => {
  vi.stubGlobal('QWIK_BACKPATCH_EXECUTOR_MINIFIED', 'min');
  vi.stubGlobal('QWIK_BACKPATCH_EXECUTOR_DEBUG', 'debug');
});

import { vi } from 'vitest';
import { installOutOfOrderExecutor } from '../out-of-order-executor-shared';

// stub QWIK_BACKPATCH_EXECUTOR_MINIFIED and QWIK_BACKPATCH_EXECUTOR_DEBUG for testing
vi.hoisted(() => {
  vi.stubGlobal('QWIK_BACKPATCH_EXECUTOR_MINIFIED', 'min');
  vi.stubGlobal('QWIK_BACKPATCH_EXECUTOR_DEBUG', 'debug');
});

vi.stubGlobal('qInstallOOOS', installOutOfOrderExecutor);
vi.stubGlobal('QWIK_OUT_OF_ORDER_EXECUTOR_MINIFIED', 'globalThis.qInstallOOOS(document)');
vi.stubGlobal('QWIK_OUT_OF_ORDER_EXECUTOR_DEBUG', 'globalThis.qInstallOOOS(document)');

import { vi } from 'vitest';
import { installOutOfOrderExecutor } from '../out-of-order-executor-shared';
import { installErrorSwapExecutor } from '../error-swap-executor-shared';

vi.hoisted(() => {
  vi.stubGlobal('QWIK_BACKPATCH_EXECUTOR_MINIFIED', 'min');
  vi.stubGlobal('QWIK_BACKPATCH_EXECUTOR_DEBUG', 'debug');
});

vi.stubGlobal('qInstallOOOS', installOutOfOrderExecutor);
vi.stubGlobal('QWIK_OUT_OF_ORDER_EXECUTOR_MINIFIED', 'globalThis.qInstallOOOS(document)');
vi.stubGlobal('QWIK_OUT_OF_ORDER_EXECUTOR_DEBUG', 'globalThis.qInstallOOOS(document)');

vi.stubGlobal('qInstallErrorSwap', installErrorSwapExecutor);
vi.stubGlobal('QWIK_ERROR_SWAP_EXECUTOR_MINIFIED', 'globalThis.qInstallErrorSwap(document)');
vi.stubGlobal('QWIK_ERROR_SWAP_EXECUTOR_DEBUG', 'globalThis.qInstallErrorSwap(document)');

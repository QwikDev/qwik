/**
 * Qwik ErrorBoundary Swap Executor
 *
 * This is the inline script entry. The actual logic lives in error-swap-executor-shared.ts so
 * source tests can install the same executor.
 */

import { installErrorSwapExecutor } from './error-swap-executor-shared';

installErrorSwapExecutor(document);

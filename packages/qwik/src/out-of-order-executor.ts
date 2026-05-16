/**
 * Qwik Out-of-Order Suspense Executor
 *
 * This is the inline script entry. The actual logic lives in out-of-order-executor-shared.ts so
 * source tests can install the same executor.
 */

import { installOutOfOrderExecutor } from './out-of-order-executor-shared';

installOutOfOrderExecutor(document);

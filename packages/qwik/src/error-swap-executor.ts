/**
 * Inline script entry; logic lives in error-swap-executor-shared.ts so source tests can install the
 * same executor.
 */

import { installErrorSwapExecutor } from './error-swap-executor-shared';

installErrorSwapExecutor(document);

/** Inline script entry; logic is in the shared module so tests can install it. */

import { installErrorSwapExecutor } from './error-swap-executor-shared';

installErrorSwapExecutor(document);

import { qwikJsonDebug, runQwikJsonDebug } from './json';

/**
 * @alpha
 * @experimental
 */
export const devtoolsJsonSRC = `${runQwikJsonDebug}\n${qwikJsonDebug}\nrunQwikJsonDebug(window, document, qwikJsonDebug);`;

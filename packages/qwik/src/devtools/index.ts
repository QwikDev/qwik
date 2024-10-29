import { qwikJsonDebug, runQwikJsonDebug } from './json';

/**
 * @beta
 * @experimental
 */
export const devtoolsJsonSRC = `${runQwikJsonDebug}\n${qwikJsonDebug}\nrunQwikJsonDebug(window, document, qwikJsonDebug);`;

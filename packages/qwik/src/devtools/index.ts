import { qwikJsonDebug, runQwikJsonDebug } from './json';

/* @experimental */
export const devtoolsJsonSRC = `${runQwikJsonDebug}\n${qwikJsonDebug}\nrunQwikJsonDebug(window, document, qwikJsonDebug);`;

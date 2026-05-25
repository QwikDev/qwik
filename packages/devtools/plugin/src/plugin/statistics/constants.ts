import createDebug from 'debug';

export const PERF_VIRTUAL_ID = 'virtual:qwik-component-proxy';
export const log = createDebug('qwik:devtools:perf');

export type AnyRecord = Record<string, any>;

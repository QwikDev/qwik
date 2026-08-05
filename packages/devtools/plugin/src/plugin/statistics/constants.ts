import createDebug from 'debug';
import { PERF_VIRTUAL_MODULE_ID } from '@qwik.dev/devtools/kit';

export const PERF_VIRTUAL_ID = PERF_VIRTUAL_MODULE_ID;
export const log = createDebug('qwik:devtools:perf');

export type AnyRecord = Record<string, any>;

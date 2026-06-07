export const PERF_VIRTUAL_MODULE_ID = 'virtual:qwik-component-proxy';

export const PERF_PHASE_SSR = 'ssr';
export const PERF_PHASE_CSR = 'csr';

export const DEFAULT_PERF_STORE_EXPRESSION = '{ ssr: [], csr: [] }';

export type QwikDevtoolsPerfPhase = typeof PERF_PHASE_SSR | typeof PERF_PHASE_CSR;

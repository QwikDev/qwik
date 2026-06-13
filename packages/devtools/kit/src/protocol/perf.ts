export const PERF_VIRTUAL_MODULE_ID = 'virtual:qwik-component-proxy';

export const PERF_PHASE_SSR = 'ssr';
export const PERF_PHASE_CSR = 'csr';

export const DEFAULT_PERF_STORE_EXPRESSION = '{ ssr: [], csr: [] }';

export type QwikDevtoolsPerfPhase = typeof PERF_PHASE_SSR | typeof PERF_PHASE_CSR;

/**
 * A single render event emitted by the performance runtime (CSR render with timing). Shared data
 * contract: do not redeclare in consumers, import it from here.
 */
export interface DevtoolsRenderEvent {
  component: string;
  phase: string;
  duration: number;
  timestamp: number;
}

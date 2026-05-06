/**
 * Virtual module source for perf tracking of Qwik's `componentQrl`.
 *
 * This module is loaded via the devtools plugin virtual-module registry
 * (`virtualmodules/virtualModules.ts`) and is imported from:
 *
 * - `virtual:qwik-component-proxy`
 */
import perfRuntime from './perfRuntime';

const qwikComponentProxy = `${perfRuntime}
import { componentQrl as originalComponentQrl } from '@qwik.dev/core';

function componentQrl(qrl, options) {
  const phase = __qwik_perf_is_server__() ? 'ssr' : 'csr';
  const start = performance.now();
  let viteId = null;
  const component = qrl?.getSymbol?.() || qrl?.$symbol$ || 'unknown';
  if(qrl.dev){
    viteId = qrl.dev.file.replace(/[^/]*$/, qrl.dev.displayName);
  }
  const result = originalComponentQrl(qrl, options);
  const duration = performance.now() - start;
  __qwik_perf_commit_componentqrl__({
    component,
    phase,
    duration,
    start,  
    viteId,
    end: start + duration,
  });
  return result;
}

export { componentQrl };
`;

export default qwikComponentProxy;

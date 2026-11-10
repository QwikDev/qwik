/**
 * Virtual module source for perf tracking of Qwik's `componentQrl`.
 *
 * This module is loaded via the devtools plugin virtual-module registry
 * (`virtualmodules/virtualModules.ts`) and is imported from:
 *
 * - `virtual:qwik-component-proxy`
 */
import perfLazyWrapperPreamble from './perfLazyWrapperPreamble';

const qwikComponentProxy = `${perfLazyWrapperPreamble}
import { componentQrl as originalComponentQrl } from '@qwik.dev/core';

// Perf store key shared by a component's setup and its renders.
const __qwik_perf_key__ = (qrl) =>
  qrl?.dev ? qrl.dev.file.replace(/[^/]*$/, qrl.dev.displayName) : null;

// Only render segments end in \`_component\`; skip tasks and handlers.
const __qwik_wrap_render__ = (fn, name, qrl) =>
  qrl?.dev?.displayName?.endsWith('_component')
    ? __qwik_wrap__(fn, name, __qwik_perf_key__(qrl))
    : fn;

function componentQrl(qrl, options) {
  const phase = __qwik_perf_is_server__() ? 'ssr' : 'csr';
  const start = performance.now();
  const viteId = __qwik_perf_key__(qrl);
  const component = qrl?.getSymbol?.() || qrl?.$symbol$ || 'unknown';
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

export { componentQrl, __qwik_wrap__, __qwik_wrap_render__ };
`;

export default qwikComponentProxy;

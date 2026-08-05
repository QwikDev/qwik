import {
  DEFAULT_PERF_STORE_EXPRESSION,
  DEVTOOLS_MESSAGES,
  PERF_PHASE_CSR,
  PERF_PHASE_SSR,
  QWIK_DEVTOOLS_GLOBAL,
} from '@qwik.dev/devtools/kit';
import {
  createRuntimeAssignment,
  createRuntimeInstallerSource,
  createRuntimeModule,
  runtimeExpression,
  serializeRuntimeValue,
} from './create-runtime-module';
import { __qwik_install_perf_runtime__ } from './installers';

export function createPerfRuntime(): string {
  return createRuntimeModule([
    '// [qwik-perf-runtime] shared helpers (injected)',
    createRuntimeInstallerSource(__qwik_install_perf_runtime__),
    createRuntimeAssignment(
      '__qwik_perf_runtime__',
      `__qwik_install_perf_runtime__(${runtimeOptionsSource()})`
    ),
    createRuntimeAssignment('__qwik_perf_is_server__', '__qwik_perf_runtime__.isServer'),
    createRuntimeAssignment('__qwik_perf_commit__', '__qwik_perf_runtime__.commit'),
    createRuntimeAssignment(
      '__qwik_perf_commit_componentqrl__',
      '__qwik_perf_runtime__.commitComponentQrl'
    ),
  ]);
}

function runtimeOptionsSource(): string {
  return serializeRuntimeValue({
    defaultPerfStore: runtimeExpression(DEFAULT_PERF_STORE_EXPRESSION),
    devtoolsGlobalKey: QWIK_DEVTOOLS_GLOBAL.key,
    globalVersion: QWIK_DEVTOOLS_GLOBAL.version,
    hookKey: QWIK_DEVTOOLS_GLOBAL.props.hook,
    pageMessageSource: DEVTOOLS_MESSAGES.pageSource,
    perfStoreExpression: `window[${JSON.stringify(QWIK_DEVTOOLS_GLOBAL.key)}]?.[${JSON.stringify(
      QWIK_DEVTOOLS_GLOBAL.props.perf
    )}]`,
    perfStoreKey: QWIK_DEVTOOLS_GLOBAL.props.perf,
    renderEventType: DEVTOOLS_MESSAGES.types.render,
    ssrPerfCountKey: QWIK_DEVTOOLS_GLOBAL.ssr.perfCount,
    ssrPerfIdKey: QWIK_DEVTOOLS_GLOBAL.ssr.perfId,
    ssrPerfIndexKey: QWIK_DEVTOOLS_GLOBAL.ssr.perfIndex,
    ssrPerfStoreKey: QWIK_DEVTOOLS_GLOBAL.ssr.perfStore,
    csrPhase: PERF_PHASE_CSR,
    ssrPhase: PERF_PHASE_SSR,
  });
}

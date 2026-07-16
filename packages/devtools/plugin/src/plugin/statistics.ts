import type { Plugin } from 'vite';
import { normalizeVirtualModuleId } from '../virtualmodules/ids';
import { attachSsrPerfInjectorMiddleware } from './statistics/ssrPerfMiddleware';
import {
  findQwikLazyComponentExports,
  isPerfVirtualModuleId,
  rewriteComponentQrlImport,
  shouldTransformStatisticsSource,
  wrapQwikLazyComponentExports,
} from '../transforms/perf-transform';

/**
 * Statistics plugin: collect Qwik render performance.
 *
 * Responsibilities:
 *
 * - Rewrite `componentQrl` imports to a proxy virtual module
 * - Wrap generated lazy component modules so CSR perf can be recorded
 * - Inject SSR perf snapshots into dev HTML responses
 */
export function statisticsPlugin(): Plugin {
  return {
    name: 'vite:qwik-component-proxy-transform',
    enforce: 'post',
    apply: 'serve',
    transform(code, id) {
      if (isPerfVirtualModuleId(id)) {
        return null;
      }
      if (!shouldTransformStatisticsSource(id)) {
        return null;
      }

      let modifiedCode = code;
      let hasChanges = false;

      const rewritten = rewriteComponentQrlImport(modifiedCode, id);
      modifiedCode = rewritten.code;
      hasChanges = hasChanges || rewritten.changed;

      const cleanId = normalizeVirtualModuleId(id);
      if (cleanId.includes('_component_')) {
        const exports = findQwikLazyComponentExports(code);
        const wrapped = wrapQwikLazyComponentExports({
          code: modifiedCode,
          id,
          exports,
        });
        modifiedCode = wrapped.code;
        hasChanges = hasChanges || wrapped.changed;
      }

      if (!hasChanges) {
        return null;
      }
      return { code: modifiedCode, map: null };
    },

    configureServer(server) {
      attachSsrPerfInjectorMiddleware(server);
    },
  };
}

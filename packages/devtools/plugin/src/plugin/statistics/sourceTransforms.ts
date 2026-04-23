import perfLazyWrapperPreamble from '../../virtualmodules/perfLazyWrapperPreamble';
import { isVirtualId, normalizeId } from '../../virtualmodules/virtualModules';
import { PERF_VIRTUAL_ID, log } from './constants';

export function shouldTransformStatisticsSource(id: string): boolean {
  const cleanId = normalizeId(id);
  return !isFromNodeModules(cleanId) && !isUiLibBuildOutput(cleanId);
}

export function isPerfVirtualModuleId(id: string): boolean {
  return isVirtualId(id, PERF_VIRTUAL_ID);
}

export function rewriteComponentQrlImport(
  code: string,
  id: string
): { code: string; changed: boolean } {
  if (!code.includes('@qwik.dev/core') || !code.includes('componentQrl')) {
    return { code, changed: false };
  }

  const importRe = /import\s*\{([^}]*)\}\s*from\s*['"]@qwik\.dev\/core['"]/g;
  let changed = false;

  const nextCode = code.replace(importRe, (match, imports) => {
    const importList = String(imports)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    const hasComponentQrl = importList.some(
      (item) => item === 'componentQrl' || item.startsWith('componentQrl ')
    );
    if (!hasComponentQrl) {
      return match;
    }

    changed = true;
    log('rewrite componentQrl import %O', {
      id,
      isVirtual: normalizeId(id).startsWith('\0'),
    });

    const preservedImports = importList.filter(
      (item) => item !== 'componentQrl' && !item.startsWith('componentQrl ')
    );

    if (preservedImports.length === 0) {
      return `import { componentQrl } from '${PERF_VIRTUAL_ID}'`;
    }

    return [
      `import { ${preservedImports.join(', ')} } from '@qwik.dev/core';`,
      `import { componentQrl } from '${PERF_VIRTUAL_ID}'`,
    ].join('\n');
  });

  return { code: nextCode, changed };
}

export function findQwikLazyComponentExports(code: string): string[] {
  const exportRe = /export\s+const\s+(\w+_component_\w+)\s*=/g;
  const exports: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = exportRe.exec(code)) !== null) {
    exports.push(match[1]);
  }

  return exports;
}

export function wrapQwikLazyComponentExports(params: {
  code: string;
  id: string;
  exports: string[];
}): { code: string; changed: boolean } {
  const { code, exports, id } = params;
  if (exports.length === 0) {
    return { code, changed: false };
  }

  log('wrap _component_ exports %O', { id, count: exports.length });

  let modifiedCode = perfLazyWrapperPreamble + code;
  for (const exportName of exports) {
    modifiedCode = replaceExportWithOriginal(modifiedCode, exportName);
    modifiedCode = appendWrappedExport(modifiedCode, exportName, id);
  }

  return { code: modifiedCode, changed: true };
}

function isFromNodeModules(cleanId: string): boolean {
  return cleanId.includes('/node_modules/') || cleanId.includes('\\node_modules\\');
}

function isUiLibBuildOutput(cleanId: string): boolean {
  return cleanId.includes('/packages/ui/lib/') || cleanId.includes('\\packages\\ui\\lib\\');
}

function replaceExportWithOriginal(code: string, exportName: string): string {
  return code.replace(
    new RegExp(`export\\s+const\\s+${exportName}\\s*=`),
    `const __original_${exportName}__ =`
  );
}

function appendWrappedExport(code: string, exportName: string, id: string): string {
  const serializedExportName = JSON.stringify(exportName);
  const serializedId = JSON.stringify(id);
  return `${code}
export const ${exportName} = __qwik_wrap__(__original_${exportName}__, ${serializedExportName}, ${serializedId});
`;
}

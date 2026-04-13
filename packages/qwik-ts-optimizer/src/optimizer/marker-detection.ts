/**
 * Marker function detection for the Qwik optimizer.
 *
 * Identifies which CallExpression nodes in an AST should trigger segment
 * extraction: calls ending with `$` that are imported from @qwik.dev/core
 * (or @builder.io/qwik) or defined as custom inlined functions.
 */

export interface ImportInfo {
  localName: string;
  importedName: string;
  source: string;
  isQwikCore: boolean;
}

export interface CustomInlinedInfo {
  dollarName: string;
  qrlName: string;
}

const QWIK_CORE_PREFIXES = [
  '@qwik.dev/core',
  '@qwik.dev/react',
  '@qwik.dev/router',
  '@builder.io/qwik-react',
  '@builder.io/qwik-city',
  '@builder.io/qwik',
];

function isQwikCoreSource(source: string): boolean {
  return QWIK_CORE_PREFIXES.some(
    (prefix) => source === prefix || source.startsWith(prefix + '/'),
  );
}

/** Collect all import declarations, returning a map keyed by local binding name. */
export function collectImports(program: any): Map<string, ImportInfo> {
  const imports = new Map<string, ImportInfo>();

  for (const node of program.body) {
    if (node.type !== 'ImportDeclaration') continue;

    const source = node.source.value;
    const isQwik = isQwikCoreSource(source);

    for (const spec of node.specifiers) {
      if (spec.type === 'ImportSpecifier') {
        const localName = spec.local.name;
        const importedName = spec.imported?.name ?? localName;
        imports.set(localName, {
          localName,
          importedName,
          source,
          isQwikCore: isQwik,
        });
      } else if (spec.type === 'ImportDefaultSpecifier') {
        imports.set(spec.local.name, {
          localName: spec.local.name,
          importedName: 'default',
          source,
          isQwikCore: isQwik,
        });
      } else if (spec.type === 'ImportNamespaceSpecifier') {
        imports.set(spec.local.name, {
          localName: spec.local.name,
          importedName: '*',
          source,
          isQwikCore: isQwik,
        });
      }
    }
  }

  return imports;
}

/** Scan for `export const X$ = wrap(XQrl)` custom inlined function patterns. */
export function collectCustomInlined(program: any): Map<string, CustomInlinedInfo> {
  const custom = new Map<string, CustomInlinedInfo>();

  for (const node of program.body) {
    if (node.type !== 'ExportNamedDeclaration') continue;
    if (!node.declaration || node.declaration.type !== 'VariableDeclaration') continue;

    for (const decl of node.declaration.declarations) {
      if (decl.id?.type !== 'Identifier') continue;

      const name = decl.id.name;
      if (!name.endsWith('$')) continue;

      const init = decl.init;
      if (!init || init.type !== 'CallExpression') continue;
      if (init.arguments.length < 1) continue;

      const firstArg = init.arguments[0];
      if (firstArg.type !== 'Identifier' || !firstArg.name.endsWith('Qrl')) continue;

      custom.set(name, { dollarName: name, qrlName: firstArg.name });
    }
  }

  return custom;
}

/** Extract callee name from a CallExpression (Identifier callees only). */
export function getCalleeName(callExpr: any): string | null {
  return callExpr.callee?.type === 'Identifier' ? callExpr.callee.name : null;
}

/**
 * Check if a CallExpression is a marker call that should trigger extraction.
 *
 * A marker call has a callee whose *original* (imported) name ends with `$`,
 * or is in the customInlined map. Handles renamed imports like
 * `import { component$ as Component }`.
 */
export function isMarkerCall(
  callExpr: any,
  imports: Map<string, ImportInfo>,
  customInlined: Map<string, CustomInlinedInfo>
): boolean {
  const name = getCalleeName(callExpr);
  if (!name) return false;

  const importInfo = imports.get(name);
  if (importInfo && importInfo.importedName.endsWith('$')) return true;
  if (name.endsWith('$') && customInlined.has(name)) return true;

  return false;
}

export function isBare$(callExpr: any): boolean {
  return getCalleeName(callExpr) === '$';
}

/** sync$ is a marker but does NOT extract a segment. */
export function isSyncMarker(calleeName: string): boolean {
  return calleeName === 'sync$';
}

export function getCtxKind(
  _calleeName: string,
  isJsxEventAttr: boolean,
  isJsxNonEventAttr: boolean = false,
): 'function' | 'eventHandler' | 'jSXProp' {
  if (isJsxEventAttr) return 'eventHandler';
  if (isJsxNonEventAttr) return 'jSXProp';
  return 'function';
}

export function getCtxName(
  calleeName: string,
  isJsxEventAttr: boolean,
  jsxAttrName?: string
): string {
  return (isJsxEventAttr && jsxAttrName) ? jsxAttrName : calleeName;
}

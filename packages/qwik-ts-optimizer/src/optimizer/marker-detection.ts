/**
 * Marker function detection for the Qwik optimizer.
 *
 * Identifies which CallExpression nodes in an AST should trigger segment
 * extraction: calls ending with `$` that are imported from @qwik.dev/core
 * (or @builder.io/qwik) or defined as custom inlined functions.
 */

/** Information about an imported binding. */
export interface ImportInfo {
  /** The local binding name (after `as` rename, if any). */
  localName: string;
  /** The original exported name from the source module. */
  importedName: string;
  /** The module source (e.g., "@qwik.dev/core"). */
  source: string;
  /** Whether source is @qwik.dev/core or @builder.io/qwik (or sub-paths). */
  isQwikCore: boolean;
}

/** Information about a custom inlined $-suffixed function. */
export interface CustomInlinedInfo {
  /** The dollar-suffixed name, e.g., "useMemo$". */
  dollarName: string;
  /** The Qrl variant name, e.g., "useMemoQrl". */
  qrlName: string;
}

/** Known Qwik core package prefixes. */
const QWIK_CORE_PREFIXES = [
  '@qwik.dev/core',
  '@builder.io/qwik',
];

/** Check if a module source is a Qwik core package (or sub-path). */
function isQwikCoreSource(source: string): boolean {
  for (const prefix of QWIK_CORE_PREFIXES) {
    if (source === prefix || source.startsWith(prefix + '/')) {
      return true;
    }
  }
  return false;
}

/**
 * Collect all import declarations from a parsed AST Program node.
 * Returns a map keyed by local binding name.
 */
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

/**
 * Scan module body for `export const X$ = wrap(XQrl)` patterns.
 * These define custom inlined $-suffixed functions.
 */
export function collectCustomInlined(program: any): Map<string, CustomInlinedInfo> {
  const custom = new Map<string, CustomInlinedInfo>();

  for (const node of program.body) {
    if (node.type !== 'ExportNamedDeclaration') continue;
    if (!node.declaration || node.declaration.type !== 'VariableDeclaration') continue;

    for (const decl of node.declaration.declarations) {
      if (decl.id?.type !== 'Identifier') continue;
      const name = decl.id.name;

      // Must end with $
      if (!name.endsWith('$')) continue;

      // init must be a CallExpression (the wrap() call)
      const init = decl.init;
      if (!init || init.type !== 'CallExpression') continue;

      // The first argument should be an Identifier ending with Qrl
      if (init.arguments.length < 1) continue;
      const arg = init.arguments[0];
      if (arg.type !== 'Identifier') continue;
      if (!arg.name.endsWith('Qrl')) continue;

      custom.set(name, {
        dollarName: name,
        qrlName: arg.name,
      });
    }
  }

  return custom;
}

/**
 * Get the callee name from a CallExpression node.
 * Currently handles Identifier callees only.
 * Returns null if callee is not a simple Identifier.
 */
export function getCalleeName(callExpr: any): string | null {
  if (callExpr.callee?.type === 'Identifier') {
    return callExpr.callee.name;
  }
  return null;
}

/**
 * Check if a CallExpression is a marker call that should trigger extraction.
 *
 * A marker call is one where:
 * 1. Callee name ends with `$`
 * 2. AND (imported from qwik core OR found in customInlined map)
 */
export function isMarkerCall(
  callExpr: any,
  imports: Map<string, ImportInfo>,
  customInlined: Map<string, CustomInlinedInfo>
): boolean {
  const name = getCalleeName(callExpr);
  if (!name) return false;
  if (!name.endsWith('$')) return false;

  // Check if it's a qwik core import
  const importInfo = imports.get(name);
  if (importInfo?.isQwikCore) return true;

  // Check if it's a custom inlined function
  if (customInlined.has(name)) return true;

  return false;
}

/**
 * Check if a CallExpression is a bare `$()` call (as opposed to `component$()`, etc.).
 */
export function isBare$(callExpr: any): boolean {
  const name = getCalleeName(callExpr);
  return name === '$';
}

/**
 * Check if a callee name is the sync$ marker.
 * sync$ is special: it IS a marker but does NOT extract a segment.
 */
export function isSyncMarker(calleeName: string): boolean {
  return calleeName === 'sync$';
}

/**
 * Determine ctxKind for a marker call.
 * "eventHandler" for JSX event attributes (onClick$, onChange$, etc.),
 * "function" for everything else.
 */
export function getCtxKind(
  calleeName: string,
  isJsxEventAttr: boolean
): 'function' | 'eventHandler' {
  return isJsxEventAttr ? 'eventHandler' : 'function';
}

/**
 * Determine ctxName for a marker call.
 * For regular calls, it's the callee name itself.
 * For JSX event attributes, it's the attribute name (e.g., "onClick$").
 */
export function getCtxName(
  calleeName: string,
  isJsxEventAttr: boolean,
  jsxAttrName?: string
): string {
  if (isJsxEventAttr && jsxAttrName) {
    return jsxAttrName;
  }
  return calleeName;
}

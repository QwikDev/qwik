/**
 * Parent module rewriting engine for the Qwik optimizer.
 *
 * Uses magic-string to surgically edit the original source text at
 * AST-provided positions, replacing $() calls with QRL references,
 * managing imports, and assembling the final parent module output.
 *
 * Output structure:
 *   [optimizer-added imports]
 *   [original non-marker imports]
 *   //
 *   [QRL const declarations]
 *   //
 *   [rewritten module body]
 *   [_auto_ exports if any]
 *
 * Implements: EXTRACT-03, EXTRACT-05, EXTRACT-06, IMP-04, IMP-06, CAPT-03
 */

import MagicString from 'magic-string';
import { parseSync } from 'oxc-parser';
import { transformSync as oxcTransformSync } from 'oxc-transform';
import type { ExtractionResult } from './extract.js';
import type { ImportInfo } from './marker-detection.js';
import type { MigrationDecision, ModuleLevelDecl } from './variable-migration.js';
import { rewriteImportSource } from './rewrite-imports.js';
import {
  buildQrlDeclaration,
  buildSyncTransform,
  needsPureAnnotation,
  getQrlImportSource,
} from './rewrite-calls.js';
import { buildQrlDevDeclaration, buildDevFilePath } from './dev-mode.js';
import {
  buildNoopQrlDeclaration,
  buildNoopQrlDevDeclaration,
  buildStrippedNoopQrl,
  buildStrippedNoopQrlDev,
  buildSCall,
  buildHoistConstDecl,
  buildHoistSCall,
} from './inline-strategy.js';
import { isStrippedSegment } from './strip-ctx.js';
import { injectCapturesUnpacking } from './segment-codegen.js';
import { transformEventPropName } from './event-handler-transform.js';
import { transformAllJsx, type JsxTransformOutput } from './jsx-transform.js';
import { SignalHoister } from './signal-analysis.js';
import { stripExportDeclarations } from './strip-exports.js';
import { replaceConstants } from './const-replacement.js';
import type { EmitMode } from './types.js';

// ---------------------------------------------------------------------------
// Inline strategy options
// ---------------------------------------------------------------------------

export interface InlineStrategyOptions {
  /** Whether to use inline/hoist strategy (_noopQrl + .s()) */
  inline: boolean;
  /** Entry strategy type: 'inline' puts body in .s(), 'hoist' extracts body as const */
  entryType?: 'inline' | 'hoist';
  /** Strip context names (server/client strip) */
  stripCtxName?: string[];
  /** Strip event handlers */
  stripEventHandlers?: boolean;
  /** Register context names (server-tagged extractions get _regSymbol wrapping) */
  regCtxName?: string[];
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParentRewriteResult {
  /** Rewritten parent module source code. */
  code: string;
  /** All extractions (possibly with nested parent refs). */
  extractions: ExtractionResult[];
  /** Final JSX key counter value after parent module transform (for segment continuation). */
  jsxKeyCounterValue?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse array literal items from source text like "[left, true, right]".
 * Returns an array of trimmed item strings.
 */
function parseArrayItems(arrayText: string): string[] {
  // Strip surrounding brackets
  let inner = arrayText.trim();
  if (inner.startsWith('[')) inner = inner.slice(1);
  if (inner.endsWith(']')) inner = inner.slice(0, -1);
  inner = inner.trim();
  if (!inner) return [];
  return inner.split(',').map(s => s.trim()).filter(s => s.length > 0);
}

/**
 * Determine which import specifiers in an import declaration are markers
 * that should be removed (they're replaced by Qrl variants).
 */
function isMarkerSpecifier(
  importedName: string,
  extractedCalleeNames: Set<string>,
): boolean {
  return extractedCalleeNames.has(importedName);
}

/**
 * Check if an extraction is for a custom inlined function (not imported from qwik core).
 * Custom inlined functions have their Qrl variant defined locally, so we don't add an import.
 */
function isCustomInlined(
  ext: ExtractionResult,
  originalImports: Map<string, ImportInfo>,
): boolean {
  // ext.calleeName is the canonical (imported) name, but originalImports is keyed by local name.
  // Search by importedName to handle aliases (e.g., `import { component$ as c$ }`).
  for (const [, info] of originalImports) {
    if (info.importedName === ext.calleeName) {
      // Found in imports -- it's imported, not custom inlined.
      // The Qrl variant import is needed (from the same source package).
      return false;
    }
  }
  // Not found in imports at all — must be custom inlined (locally defined via wrap pattern)
  return true;
}

// ---------------------------------------------------------------------------
// regCtxName matching
// ---------------------------------------------------------------------------

/**
 * Check if an extraction matches a regCtxName entry.
 *
 * Match rule: extraction's callee name (e.g., "server$") starts with the
 * regCtxName value (e.g., "server") followed by "$".
 */
function matchesRegCtxName(ext: ExtractionResult, regCtxName?: string[]): boolean {
  if (!regCtxName || regCtxName.length === 0) return false;
  for (const name of regCtxName) {
    if (ext.calleeName === name + '$') return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Const literal resolution for regCtxName capture inlining
// ---------------------------------------------------------------------------

/**
 * Parse a parent extraction body and find const declarations with literal values
 * for the given capture names.
 *
 * Returns a map of variable name -> literal source text (e.g., "'hola'").
 */
function resolveConstLiterals(parentBody: string, captureNames: string[]): Map<string, string> {
  const result = new Map<string, string>();
  if (captureNames.length === 0) return result;

  const wrapperPrefix = 'const __rl__ = ';
  const wrappedSource = wrapperPrefix + parentBody;
  const parseResult = parseSync('__rl__.tsx', wrappedSource, { experimentalRawTransfer: true } as any);
  if (!parseResult.program || parseResult.errors?.length) return result;

  const offset = wrapperPrefix.length;
  const captureSet = new Set(captureNames);

  // Walk the parsed body to find const declarations
  function walkNode(node: any): void {
    if (!node || typeof node !== 'object') return;

    if (node.type === 'VariableDeclaration' && node.kind === 'const') {
      for (const decl of node.declarations ?? []) {
        if (decl.id?.type === 'Identifier' && captureSet.has(decl.id.name) && decl.init) {
          // Check if init is a simple literal
          const init = decl.init;
          if (init.type === 'StringLiteral' || init.type === 'Literal') {
            // Get the literal source text from the parent body
            const literalStart = init.start - offset;
            const literalEnd = init.end - offset;
            if (literalStart >= 0 && literalEnd <= parentBody.length) {
              result.set(decl.id.name, parentBody.slice(literalStart, literalEnd));
            }
          } else if (init.type === 'NumericLiteral') {
            const literalStart = init.start - offset;
            const literalEnd = init.end - offset;
            if (literalStart >= 0 && literalEnd <= parentBody.length) {
              result.set(decl.id.name, parentBody.slice(literalStart, literalEnd));
            }
          }
        }
      }
    }

    for (const key of Object.keys(node)) {
      if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'range') continue;
      const val = node[key];
      if (val && typeof val === 'object') {
        if (Array.isArray(val)) {
          for (const item of val) {
            if (item && typeof item.type === 'string') walkNode(item);
          }
        } else if (typeof val.type === 'string') {
          walkNode(val);
        }
      }
    }
  }

  walkNode(parseResult.program);
  return result;
}

/**
 * Replace captured identifier references in a body text with their inlined
 * literal values. Uses AST-based replacement to avoid replacing property names.
 */
function inlineConstCaptures(body: string, constValues: Map<string, string>): string {
  const wrapperPrefix = 'const __ic__ = ';
  const wrappedSource = wrapperPrefix + body;
  const parseResult = parseSync('__ic__.tsx', wrappedSource, { experimentalRawTransfer: true } as any);
  if (!parseResult.program || parseResult.errors?.length) return body;

  const offset = wrapperPrefix.length;
  const replacements: Array<{ start: number; end: number; value: string }> = [];

  function walkNode(node: any, parentKey?: string, parentNode?: any): void {
    if (!node || typeof node !== 'object') return;

    if (node.type === 'Identifier' && constValues.has(node.name)) {
      // Skip property keys and member expression property names
      const isPropertyKey = parentKey === 'key' && (parentNode?.type === 'Property' || parentNode?.type === 'ObjectProperty');
      const isMemberProp = parentKey === 'property' && (parentNode?.type === 'MemberExpression' || parentNode?.type === 'StaticMemberExpression');

      if (!isPropertyKey && !isMemberProp) {
        replacements.push({
          start: node.start - offset,
          end: node.end - offset,
          value: constValues.get(node.name)!,
        });
      }
    }

    for (const key of Object.keys(node)) {
      if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'range') continue;
      const val = node[key];
      if (val && typeof val === 'object') {
        if (Array.isArray(val)) {
          for (const item of val) {
            if (item && typeof item.type === 'string') walkNode(item, key, node);
          }
        } else if (typeof val.type === 'string') {
          walkNode(val, key, node);
        }
      }
    }
  }

  walkNode(parseResult.program);

  // Sort descending and apply
  replacements.sort((a, b) => b.start - a.start);
  let result = body;
  for (const r of replacements) {
    result = result.slice(0, r.start) + r.value + result.slice(r.end);
  }
  return result;
}

// ---------------------------------------------------------------------------
// .s() body transformation for inline/hoist strategy
// ---------------------------------------------------------------------------

/**
 * Options for JSX transpilation within inline .s() body text.
 */
interface SCallBodyJsxOptions {
  /** Whether to apply JSX transpilation */
  enableJsx: boolean;
  /** Set of imported identifier names (for prop classification) */
  importedNames: Set<string>;
  /** Dev mode options for JSX source info */
  devOptions?: { relPath: string };
  /** Starting key counter value (for continuation from module-level JSX) */
  keyCounterStart?: number;
  /** Relative file path for key prefix derivation */
  relPath?: string;
}

/**
 * Inject a line right after the opening brace or arrow of a function body.
 * For block bodies (`=> { ...}`), inserts after `{`.
 * For expression bodies (`=> expr`), converts to block body with return.
 */
function injectLineAfterBodyOpen(bodyText: string, line: string): string {
  // Find the arrow `=>`
  let depth = 0;
  let inString: string | null = null;
  let arrowIdx = -1;
  for (let i = 0; i < bodyText.length - 1; i++) {
    const ch = bodyText[i];
    if (inString) {
      if (ch === inString && bodyText[i - 1] !== '\\') inString = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inString = ch; continue; }
    if (ch === '(' || ch === '[' || ch === '<') { depth++; continue; }
    if (ch === ')' || ch === ']' || ch === '>') { depth--; continue; }
    if (depth === 0 && ch === '=' && bodyText[i + 1] === '>') { arrowIdx = i; break; }
  }
  if (arrowIdx === -1) {
    // Try function expression
    const braceIdx = bodyText.indexOf('{');
    if (braceIdx >= 0) {
      return bodyText.slice(0, braceIdx + 1) + '\n' + line + bodyText.slice(braceIdx + 1);
    }
    return bodyText;
  }
  let afterArrow = arrowIdx + 2;
  while (afterArrow < bodyText.length && /\s/.test(bodyText[afterArrow])) afterArrow++;
  if (bodyText[afterArrow] === '{') {
    return bodyText.slice(0, afterArrow + 1) + '\n' + line + bodyText.slice(afterArrow + 1);
  }
  // Expression body: convert to block
  const expr = bodyText.slice(afterArrow);
  const prefix = bodyText.slice(0, arrowIdx + 2);
  return prefix + ' {\n' + line + '\nreturn ' + expr + ';\n}';
}

/**
 * Apply _rawProps destructuring optimization to a component body.
 *
 * When a component's arrow function has destructured parameters like ({field1, field2}),
 * and the Rust optimizer would rewrite them as:
 * 1. Parameter: ({field1, field2}) -> (_rawProps)
 * 2. All bare references to field1, field2 in the body -> _rawProps.field1, _rawProps.field2
 *
 * After this rewrite, the signal analysis naturally detects _rawProps.field as a
 * store field access, generating _wrapProp(_rawProps, "field") or _fnSignal with _rawProps dep.
 */
export function applyRawPropsTransform(body: string): string {
  // Parse the body to get the AST and find destructured params
  const wrapperPrefix = 'const __rp__ = ';
  const wrappedSource = wrapperPrefix + body;

  const parseResult = parseSync('__rp__.tsx', wrappedSource, { experimentalRawTransfer: true } as any);
  if (!parseResult.program || parseResult.errors?.length) {
    return body;
  }

  // Find the arrow/function expression in the init of the const declaration
  const decl = parseResult.program.body?.[0];
  if (!decl || decl.type !== 'VariableDeclaration') return body;
  const init = decl.declarations?.[0]?.init;
  if (!init) return body;

  // Get params from arrow function or function expression
  let params: any[] | undefined;
  if (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression') {
    params = init.params;
  }
  if (!params || params.length === 0) return body;

  const firstParam = params[0];
  if (firstParam.type !== 'ObjectPattern') return body;

  // Collect destructured field names and their local aliases, and detect rest element
  const fields: Array<{ key: string; local: string }> = [];
  let restElementName: string | null = null;
  for (const prop of firstParam.properties ?? []) {
    if (prop.type === 'RestElement') {
      // Rest element ({...rest}) -- collect the rest variable name
      const restId = prop.argument?.type === 'Identifier' ? prop.argument.name : null;
      if (restId) {
        restElementName = restId;
      }
      continue;
    }
    if (prop.type === 'Property' || prop.type === 'ObjectProperty') {
      const keyName = prop.key?.type === 'Identifier' ? prop.key.name
                    : (prop.key?.type === 'StringLiteral' || prop.key?.type === 'Literal') ? (prop.key.value ?? null)
                    : null;
      const valName = prop.value?.type === 'Identifier' ? prop.value.name :
                      prop.value?.type === 'AssignmentPattern' && prop.value.left?.type === 'Identifier'
                        ? prop.value.left.name : null;
      if (keyName && valName) {
        fields.push({ key: String(keyName), local: valName });
      }
    }
  }

  // Calculate positions relative to the body string (subtract wrapperPrefix length)
  const offset = wrapperPrefix.length;

  // Pure rest props ({...rest}) with no named fields
  if (restElementName && fields.length === 0) {
    const paramStartPos = firstParam.start - offset;
    const paramEndPos = firstParam.end - offset;
    let result = body.slice(0, paramStartPos) + '_rawProps' + body.slice(paramEndPos);
    // Prepend _restProps assignment after the arrow/function body opening
    const restLine = `const ${restElementName} = _restProps(_rawProps);`;
    result = injectLineAfterBodyOpen(result, restLine);
    return result;
  }

  // Mixed rest props ({message, id, ...rest}) -- handle both fields AND rest element
  if (restElementName && fields.length > 0) {
    const paramStartPos = firstParam.start - offset;
    const paramEndPos = firstParam.end - offset;
    let result = body.slice(0, paramStartPos) + '_rawProps' + body.slice(paramEndPos);
    // Prepend _restProps assignment with excluded keys
    const excludedKeys = fields.map(f => `"${f.key}"`).join(',\n    ');
    const restLine = `const ${restElementName} = _restProps(_rawProps, [\n    ${excludedKeys}\n]);`;
    result = injectLineAfterBodyOpen(result, restLine);

    // Replace field references with _rawProps.fieldName (same logic as non-rest case)
    const fieldLocalToKey = new Map<string, string>();
    for (const f of fields) {
      fieldLocalToKey.set(f.local, f.key);
    }

    const reparseSource = wrapperPrefix + result;
    const reparseResult2 = parseSync('__rp3__.tsx', reparseSource, { experimentalRawTransfer: true } as any);
    if (!reparseResult2.program || reparseResult2.errors?.length) return result;

    const replacements: Array<{ start: number; end: number; key: string; isShorthand?: boolean }> = [];
    function walkForIdents(node: any, parentKey?: string, parentNode?: any): void {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'Identifier' && fieldLocalToKey.has(node.name)) {
        const isPropertyKey = parentKey === 'key' && (parentNode?.type === 'Property' || parentNode?.type === 'ObjectProperty');
        const isMemberProp = parentKey === 'property' && (parentNode?.type === 'MemberExpression' || parentNode?.type === 'StaticMemberExpression');
        const isParam = parentKey === 'params';
        const isShorthandValue = parentKey === 'value' &&
          (parentNode?.type === 'Property' || parentNode?.type === 'ObjectProperty') &&
          parentNode?.shorthand === true;
        if (isShorthandValue) {
          replacements.push({ start: node.start - offset, end: node.end - offset, key: fieldLocalToKey.get(node.name)!, isShorthand: true });
        } else if (!isPropertyKey && !isMemberProp && !isParam) {
          replacements.push({ start: node.start - offset, end: node.end - offset, key: fieldLocalToKey.get(node.name)! });
        }
      }
      for (const key of Object.keys(node)) {
        if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'range') continue;
        const val = node[key];
        if (val && typeof val === 'object') {
          if (Array.isArray(val)) {
            for (const item of val) {
              if (item && typeof item.type === 'string') walkForIdents(item, key, node);
            }
          } else if (typeof val.type === 'string') {
            walkForIdents(val, key, node);
          }
        }
      }
    }
    walkForIdents(reparseResult2.program);
    replacements.sort((a, b) => b.start - a.start);
    for (const r of replacements) {
      const accessor = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(r.key)
        ? '_rawProps.' + r.key
        : `_rawProps["${r.key}"]`;
      if (r.isShorthand) {
        result = result.slice(0, r.start) + r.key + ': ' + accessor + result.slice(r.end);
      } else {
        result = result.slice(0, r.start) + accessor + result.slice(r.end);
      }
    }
    return result;
  }

  if (fields.length === 0) return body;

  const paramStart = firstParam.start - offset;
  const paramEnd = firstParam.end - offset;

  // Step 1: Replace the destructuring pattern with _rawProps
  let result = body.slice(0, paramStart) + '_rawProps' + body.slice(paramEnd);

  // Step 2: Replace all bare identifier references to destructured fields
  // with _rawProps.fieldName. We need to be careful to only replace bare
  // identifiers, not property names in object literals or member expressions.
  //
  // Strategy: re-parse after param replacement, walk the AST to find
  // Identifier nodes that match field local names, and replace them
  // with _rawProps.keyName (using the original key, not the alias).
  const fieldLocalToKey = new Map<string, string>();
  for (const f of fields) {
    fieldLocalToKey.set(f.local, f.key);
  }

  // Re-parse to find identifier positions in the updated body
  const reparseSource = wrapperPrefix + result;
  const reparseResult = parseSync('__rp2__.tsx', reparseSource, { experimentalRawTransfer: true } as any);
  if (!reparseResult.program || reparseResult.errors?.length) return result;

  // Collect all identifier positions that need replacement (descending order for safe replacement)
  const replacements: Array<{ start: number; end: number; key: string; isShorthand?: boolean }> = [];

  function walkForIdentifiers(node: any, parentKey?: string, parentNode?: any): void {
    if (!node || typeof node !== 'object') return;

    if (node.type === 'Identifier' && fieldLocalToKey.has(node.name)) {
      // Skip if this identifier is a property key in an object literal (shorthand or not)
      // Skip if this is the parameter itself (in the _rawProps position)
      // Skip if this is a property name in a member expression (x.field -- skip 'field')
      const isPropertyKey = parentKey === 'key' && (parentNode?.type === 'Property' || parentNode?.type === 'ObjectProperty');
      const isMemberProp = parentKey === 'property' && (parentNode?.type === 'MemberExpression' || parentNode?.type === 'StaticMemberExpression');
      const isParam = parentKey === 'params';

      // For shorthand properties ({ some }), the value IS the same identifier as the key.
      // We need to handle this specially: replace the whole property with `key: _rawProps.key`.
      const isShorthandValue = parentKey === 'value' &&
        (parentNode?.type === 'Property' || parentNode?.type === 'ObjectProperty') &&
        parentNode?.shorthand === true;

      if (isShorthandValue) {
        // Replace the shorthand property identifier, but mark it so we prepend "key: "
        replacements.push({
          start: node.start - offset,
          end: node.end - offset,
          key: fieldLocalToKey.get(node.name)!,
          isShorthand: true,
        });
      } else if (!isPropertyKey && !isMemberProp && !isParam) {
        replacements.push({
          start: node.start - offset,
          end: node.end - offset,
          key: fieldLocalToKey.get(node.name)!,
        });
      }
    }

    for (const key of Object.keys(node)) {
      if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'range') continue;
      const val = node[key];
      if (val && typeof val === 'object') {
        if (Array.isArray(val)) {
          for (const item of val) {
            if (item && typeof item.type === 'string') {
              walkForIdentifiers(item, key, node);
            }
          }
        } else if (typeof val.type === 'string') {
          walkForIdentifiers(val, key, node);
        }
      }
    }
  }

  walkForIdentifiers(reparseResult.program);

  // Sort descending by start position and apply replacements
  replacements.sort((a, b) => b.start - a.start);
  for (const r of replacements) {
    // Use bracket notation for keys that aren't valid JS identifiers (e.g., "bind:value")
    const accessor = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(r.key)
      ? '_rawProps.' + r.key
      : `_rawProps["${r.key}"]`;
    if (r.isShorthand) {
      // Shorthand property: { some } -> { some: _rawProps.some }
      result = result.slice(0, r.start) + r.key + ': ' + accessor + result.slice(r.end);
    } else {
      result = result.slice(0, r.start) + accessor + result.slice(r.end);
    }
  }

  return result;
}

/**
 * Transform an extraction's body text for use in an inline .s() call.
 *
 * For parent extractions (those with nested children), the body is transformed:
 * 1. Nested $() call sites rewritten to QRL variable references
 * 2. $-suffixed callee names renamed to Qrl-suffixed
 * 3. .w([captures]) appended for children with captures
 * 4. _captures[N] unpacking injected for this extraction's own captures
 * 5. JSX transpilation (if enabled) -- converts raw JSX to _jsxSorted calls
 *
 * For leaf extractions (no nested children, no own captures), the body is returned as-is.
 */
function transformSCallBody(
  ext: ExtractionResult,
  allExtractions: ExtractionResult[],
  qrlVarNames: Map<string, string>,
  jsxBodyOptions?: SCallBodyJsxOptions,
  regCtxName?: string[],
  sharedSignalHoister?: SignalHoister,
): { transformedBody: string; additionalImports: Map<string, string>; hoistedDeclarations: string[]; keyCounterValue?: number } {
  let body = ext.bodyText;
  const additionalImports = new Map<string, string>();
  const hoistedDeclarations: string[] = [];

  // 1. Find nested extractions (children of this extraction)
  const nested = allExtractions.filter(e => e.parent === ext.symbolName);

  // 2. Rewrite nested call sites in descending position order
  //    to avoid position shifting issues
  if (nested.length > 0) {
    const bodyOffset = ext.argStart;
    const sortedNested = [...nested].sort((a, b) => b.callStart - a.callStart);

    for (const child of sortedNested) {
      const childVarName = qrlVarNames.get(child.symbolName) ?? `q_${child.symbolName}`;

      const relCallStart = child.callStart - bodyOffset;
      const relCallEnd = child.callEnd - bodyOffset;

      if (relCallStart >= 0 && relCallEnd <= body.length) {
        if (child.isBare) {
          // Bare $() -> just the QRL variable name
          body = body.slice(0, relCallStart) + childVarName + body.slice(relCallEnd);
        } else if (child.ctxKind === 'eventHandler' && !child.qrlCallee) {
          // Direct JSX event handler attribute: onClick$={() => ...) -> q-e:click={q_varName}
          // The callStart..callEnd range covers the full attribute text: onClick$={() => ...}
          // NOTE: Named markers inside JSX attrs (onClick$={server$(...)}) have qrlCallee set
          // and their callStart..callEnd only covers the call expression, so they use the
          // named marker path below instead.

          // For component elements (uppercase tag), keep original event name (onClick$)
          // For HTML elements, transform to q-e:click
          let propName: string;
          if (child.isComponentEvent) {
            // Component element: keep onClick$={q_ref}
            propName = child.ctxName;
          } else {
            const transformedPropName = transformEventPropName(child.ctxName, new Set());
            propName = transformedPropName ?? child.ctxName;
          }

          // For regCtxName-matched extractions, wrap the QRL var in serverQrl()
          const isRegCtx = matchesRegCtxName(child, regCtxName);
          let qrlRef = isRegCtx ? `serverQrl(${childVarName})` : childVarName;
          if (isRegCtx) {
            additionalImports.set('serverQrl', '@qwik.dev/core');
          }

          // Cross-scope loop captures: generate standalone .w() hoisting
          // instead of inline .w() on the QRL ref
          const hasLoopCrossCaptures = !isRegCtx &&
            child.captures &&
            child.captureNames.length > 0 &&
            child.paramNames.length >= 2 &&
            child.paramNames[0] === '_' && child.paramNames[1] === '_1';

          if (hasLoopCrossCaptures) {
            // Generate: const SymbolName = q_SymbolName.w([\n    captureVar\n]);
            // This goes before the loop body, hoisted into the map callback
            const hoistedName = child.symbolName;
            const wCaptures = child.captureNames.join(',\n            ');
            const hoistDecl = `const ${hoistedName} = ${childVarName}.w([\n            ${wCaptures}\n        ]);`;
            hoistedDeclarations.push(hoistDecl);
            // Use the hoisted variable name (not q_ prefixed) in the JSX
            qrlRef = hoistedName;
          } else if (!isRegCtx && child.captureNames.length > 0) {
            // Non-loop captures: inline .w() on the QRL ref
            qrlRef += '.w([\n        ' + child.captureNames.join(',\n        ') + '\n    ])';
          }

          const replacement = `${propName}={${qrlRef}}`;
          body = body.slice(0, relCallStart) + replacement + body.slice(relCallEnd);
        } else {
          // Named marker: callee$(args) -> calleeQrl(qrlVar)
          let replacement = child.qrlCallee + '(' + childVarName;

          // Add .w([captures]) if the child has captures
          if (child.captureNames.length > 0) {
            replacement += '.w([\n        ' + child.captureNames.join(',\n        ') + '\n    ])';
          }

          replacement += ')';
          body = body.slice(0, relCallStart) + replacement + body.slice(relCallEnd);

          // Track that we need the Qrl-suffixed callee import
          if (child.qrlCallee) {
            additionalImports.set(child.qrlCallee, getQrlImportSource(child.qrlCallee, child.importSource));
          }
        }
      }
    }
  }

  // 3. Inject _captures unpacking if this extraction has captures
  //    For regCtxName-matched extractions, inline const literal values instead
  //    of using _captures (matching Rust optimizer behavior).
  const isRegCtx = matchesRegCtxName(ext, regCtxName);
  if (isRegCtx && ext.captureNames.length > 0) {
    // Find parent extraction to resolve const values
    const parentExt = allExtractions.find(e => e.symbolName === ext.parent);
    if (parentExt) {
      const constValues = resolveConstLiterals(parentExt.bodyText, ext.captureNames);
      if (constValues.size > 0) {
        // Replace captured identifiers with their literal values in the body
        body = inlineConstCaptures(body, constValues);
      }
    }
    // Don't inject _captures for regCtxName extractions
  } else if (ext.captureNames.length > 0) {
    body = injectCapturesUnpacking(body, ext.captureNames);
    additionalImports.set('_captures', '@qwik.dev/core');
  }

  // 3b. _rawProps destructuring optimization for component$ extractions
  //     When a component has destructured params like ({field1, field2}),
  //     rewrite to (_rawProps) and replace field refs with _rawProps.field
  // Apply _rawProps to any extraction with destructured params (component$, etc.)
  // The ctxName includes the $ suffix (e.g., 'component$')
  {
    const rawPropsResult = applyRawPropsTransform(body);
    if (rawPropsResult !== body) {
      body = rawPropsResult;
      // If _restProps was introduced, ensure its import is tracked
      if (body.includes('_restProps(')) {
        additionalImports.set('_restProps', '@qwik.dev/core');
      }
    }
  }

  // 4. JSX transpilation within the body text
  let finalKeyCounterValue: number | undefined;
  if (jsxBodyOptions?.enableJsx) {
    // Wrap the body as a parseable module-level expression
    const wrapperPrefix = 'const __body__ = ';
    const wrappedSource = wrapperPrefix + body;

    // Parse the wrapped source to get an AST
    const parseResult = parseSync('__body__.tsx', wrappedSource, { experimentalRawTransfer: true } as any);
    if (parseResult.program && !parseResult.errors?.length) {
      const bodyS = new MagicString(wrappedSource);

      // Augment importedNames with QRL variable names so they're classified as
      // const in prop classification (they're module-level const declarations)
      const bodyImportedNames = new Set(jsxBodyOptions.importedNames);
      for (const [, varName] of qrlVarNames) {
        bodyImportedNames.add(varName);
      }

      // Run JSX transform on the wrapped body
      const bodyJsxResult = transformAllJsx(
        wrappedSource,
        bodyS,
        parseResult.program,
        bodyImportedNames,
        [], // No skip ranges within the body
        jsxBodyOptions.devOptions,
        jsxBodyOptions.keyCounterStart,
        true, // enableSignals
        undefined, // qpOverrides
        undefined, // qrlsWithCaptures
        undefined, // paramNames
        jsxBodyOptions.relPath, // for key prefix derivation
        sharedSignalHoister, // shared hoister for _hf counter continuity
      );

      // Extract the transformed body by stripping the wrapper prefix
      const transformedWrapped = bodyS.toString();
      body = transformedWrapped.slice(wrapperPrefix.length);

      // Strip trailing semicolon if one was added by the wrapper
      if (body.endsWith(';') && !ext.bodyText.endsWith(';')) {
        body = body.slice(0, -1);
      }

      // Collect imports needed by JSX transform
      for (const sym of bodyJsxResult.neededImports) {
        additionalImports.set(sym, '@qwik.dev/core');
      }
      if (bodyJsxResult.needsFragment) {
        additionalImports.set('Fragment as _Fragment', '@qwik.dev/core/jsx-runtime');
      }

      // Collect hoisted declarations for the parent preamble
      hoistedDeclarations.push(...bodyJsxResult.hoistedDeclarations);

      // Return the final key counter value for continuation
      finalKeyCounterValue = bodyJsxResult.keyCounterValue;
    }
  }

  return { transformedBody: body, additionalImports, hoistedDeclarations, keyCounterValue: finalKeyCounterValue };
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Options for JSX transformation during parent rewriting.
 */
export interface JsxRewriteOptions {
  /** Whether to run JSX transform (true for .tsx/.jsx files) */
  enableJsx: boolean;
  /** Set of imported identifier names (for prop classification) */
  importedNames: Set<string>;
  /** Whether to enable signal analysis (_wrapProp/_fnSignal) in JSX children.
   *  Should be false when no segments are extracted (skip-transform / lib mode). */
  enableSignals?: boolean;
}

/**
 * Rewrite a parent module source using magic-string.
 *
 * @param source - Original source code text
 * @param relPath - Relative file path
 * @param extractions - Extraction results from extractSegments()
 * @param originalImports - Import map from collectImports()
 * @param migrationDecisions - Optional migration decisions from analyzeMigration()
 * @param moduleLevelDecls - Optional module-level declarations for removal of moved vars
 * @param jsxOptions - Optional JSX transform options
 * @returns Rewritten parent module code and updated extractions
 */
export function rewriteParentModule(
  source: string,
  relPath: string,
  extractions: ExtractionResult[],
  originalImports: Map<string, ImportInfo>,
  migrationDecisions?: MigrationDecision[],
  moduleLevelDecls?: ModuleLevelDecl[],
  jsxOptions?: JsxRewriteOptions,
  mode?: EmitMode,
  devFilePath?: string,
  inlineOptions?: InlineStrategyOptions,
  stripExports?: string[],
  isServer?: boolean,
  explicitExtensions?: boolean,
  transpileTs?: boolean,
  minify?: string,
  outputExtension?: string,
): ParentRewriteResult {
  const s = new MagicString(source);
  const { program } = parseSync(relPath, source, { experimentalRawTransfer: true } as any);

  // Collect all callee names that were extracted (for removing $ imports)
  const extractedCalleeNames = new Set<string>();
  for (const ext of extractions) {
    extractedCalleeNames.add(ext.calleeName);
    // For inlinedQrl, also mark _captures as a marker specifier to remove from parent
    if (ext.isInlinedQrl) {
      extractedCalleeNames.add('_captures');
      extractedCalleeNames.add('_inlinedQrl');
    }
  }

  // Always mark the bare `$` import as a marker to strip from parent.
  // Even when `$` is not directly called (e.g., only `component$`, `server$` are called),
  // the `$` import is a Qwik marker function that gets consumed by the optimizer.
  // SWC strips it unconditionally when any extraction occurs.
  if (extractions.length > 0) {
    extractedCalleeNames.add('$');
  }

  // Track which symbols are already imported (for dedup - IMP-06)
  const alreadyImported = new Set<string>();
  for (const [localName] of originalImports) {
    alreadyImported.add(localName);
  }

  // -----------------------------------------------------------------------
  // Step 1+2: Remove import declarations from body, track surviving user imports
  // -----------------------------------------------------------------------
  // Instead of editing imports in-place, we REMOVE all import declarations from
  // the body and reassemble them in the preamble (Step 6). This ensures optimizer
  // imports appear first, then surviving user imports, matching Rust output ordering.
  const survivingUserImports: string[] = [];
  // Track structured info for each surviving import so we can filter unused specifiers later
  interface SurvivingImportInfo {
    defaultPart: string;
    nsPart: string;
    namedParts: { local: string; imported: string }[];
    quote: string;
    source: string;
    isSideEffect: boolean;
    preservedAll: boolean;
  }
  const survivingImportInfos: SurvivingImportInfo[] = [];

  for (const node of program.body) {
    if (node.type !== 'ImportDeclaration') continue;

    const specifiers = node.specifiers;
    const sourceNode = node.source;
    const rewrittenSource = rewriteImportSource(sourceNode.value);

    // Detect quote style from original source (node.source.raw starts with ' or ")
    const rawSource = (sourceNode as any).raw ?? sourceNode.value;
    const quoteChar = rawSource.startsWith("'") ? "'" : '"';

    // Side-effect imports (no specifiers): keep in original position, just rewrite source
    if (!specifiers || specifiers.length === 0) {
      if (rewrittenSource !== sourceNode.value) {
        s.overwrite(sourceNode.start + 1, sourceNode.end - 1, rewrittenSource);
      }
      continue;
    }

    // Find which specifiers are markers to remove
    const toRemove: number[] = [];
    for (let i = 0; i < specifiers.length; i++) {
      const spec = specifiers[i];
      if (spec.type !== 'ImportSpecifier') continue;
      const importedName = (spec as any).imported?.name ?? spec.local.name;
      if (isMarkerSpecifier(importedName, extractedCalleeNames)) {
        toRemove.push(i);
      }
    }

    // Remove the import declaration from the body
    let end = node.end;
    if (end < source.length && source[end] === '\n') end++;
    s.remove(node.start, end);

    if (toRemove.length === specifiers.length) {
      // All specifiers are markers: import is fully consumed, no surviving user import
      continue;
    }

    // For single-quoted Qwik core imports (user-written): if the surviving
    // (non-marker) specifiers include a non-$-suffixed identifier (like useStore),
    // preserve ALL original specifiers including markers. This matches Rust optimizer
    // behavior where the original user import is kept intact when minify is 'none'.
    const isQwikSource = rewrittenSource.startsWith('@qwik.dev/') ||
      rewrittenSource.startsWith('@builder.io/qwik');
    let preserveAll = false;
    if (isQwikSource && quoteChar === "'" && minify === 'none') {
      const hasNonDollarSurvivor = specifiers.some((spec: any, i: number) => {
        if (toRemove.includes(i)) return false;
        if (spec.type !== 'ImportSpecifier') return true; // default/namespace always non-$
        const importedName = spec.imported?.name ?? spec.local.name;
        return !importedName.endsWith('$');
      });
      if (hasNonDollarSurvivor) preserveAll = true;
    }

    // Build surviving user import, preserving original quote style
    let defaultPart = '';
    let nsPart = '';
    const namedParts: string[] = [];
    const namedPartsStructured: { local: string; imported: string }[] = [];
    for (let i = 0; i < specifiers.length; i++) {
      if (!preserveAll && toRemove.includes(i)) continue;
      const spec = specifiers[i];
      if (spec.type === 'ImportDefaultSpecifier') {
        defaultPart = spec.local.name;
      } else if (spec.type === 'ImportNamespaceSpecifier') {
        nsPart = `* as ${spec.local.name}`;
      } else {
        const localName = spec.local.name;
        const importedName = (spec as any).imported?.name ?? localName;
        namedPartsStructured.push({ local: localName, imported: importedName });
        if (importedName !== localName) {
          namedParts.push(`${importedName} as ${localName}`);
        } else {
          namedParts.push(localName);
        }
      }
    }

    let importParts = '';
    if (nsPart) {
      importParts = defaultPart ? `${defaultPart}, ${nsPart}` : nsPart;
    } else if (namedParts.length > 0) {
      importParts = defaultPart
        ? `${defaultPart}, { ${namedParts.join(', ')} }`
        : `{ ${namedParts.join(', ')} }`;
    } else if (defaultPart) {
      importParts = defaultPart;
    }

    if (importParts) {
      survivingUserImports.push(`import ${importParts} from ${quoteChar}${rewrittenSource}${quoteChar};`);
      survivingImportInfos.push({
        defaultPart,
        nsPart,
        namedParts: namedPartsStructured,
        quote: quoteChar,
        source: rewrittenSource,
        isSideEffect: false,
        preservedAll: preserveAll,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Step 2b: Strip exports (MODE-06)
  // -----------------------------------------------------------------------
  if (stripExports && stripExports.length > 0) {
    stripExportDeclarations(source, s, program, stripExports, originalImports);
  }

  // -----------------------------------------------------------------------
  // Step 2c: Const replacement (MODE-07)
  // -----------------------------------------------------------------------
  const isDev = mode === 'dev' ? true : mode === 'prod' ? false : undefined;
  if (isServer !== undefined || isDev !== undefined) {
    replaceConstants(source, s, program, originalImports, isServer, isDev);
  }

  // -----------------------------------------------------------------------
  // Step 3: Determine nesting (parent-child relationships)
  // -----------------------------------------------------------------------
  // Sort by callStart ascending to detect containment
  const sorted = [...extractions].sort((a, b) => a.callStart - b.callStart);

  // Mark nested extractions: an extraction is nested if its call range
  // is fully contained within another extraction's argument range.
  // Also set the parent field for nested extractions.
  // We pick the INNERMOST (closest/smallest) containing parent to handle
  // multi-level nesting correctly (e.g., component$ > component$ > onClick$).
  for (let i = 0; i < sorted.length; i++) {
    let bestParent: typeof sorted[0] | null = null;
    let bestRange = Infinity;
    for (let j = 0; j < sorted.length; j++) {
      if (i === j) continue;
      // Check if sorted[i] is inside sorted[j]'s argument
      if (
        sorted[i].callStart >= sorted[j].argStart &&
        sorted[i].callEnd <= sorted[j].argEnd
      ) {
        const range = sorted[j].argEnd - sorted[j].argStart;
        if (range < bestRange) {
          bestRange = range;
          bestParent = sorted[j];
        }
      }
    }
    if (bestParent) {
      sorted[i].parent = bestParent.symbolName;
    }
  }

  // Update the extractions array with parent info
  for (const ext of sorted) {
    const orig = extractions.find((e) => e.symbolName === ext.symbolName);
    if (orig) orig.parent = ext.parent;
  }

  // Top-level extractions: those with no parent
  const topLevel = extractions.filter((e) => e.parent === null);

  // -----------------------------------------------------------------------
  // Step 3b: Pre-compute QRL variable names for stripped segments
  // -----------------------------------------------------------------------
  // When strip options are active, stripped segments use sentinel-named variables
  // (q_qrl_{counter}) instead of q_{symbolName}. We compute this map early so
  // call site rewriting uses the correct variable names.
  const earlyQrlVarNames = new Map<string, string>();
  let earlyStrippedCounter = 0;
  if (inlineOptions) {
    // For inline/hoist, compute QRL var names for ALL non-sync extractions (including nested)
    for (const ext of extractions) {
      if (ext.isSync) continue;
      const stripped = isStrippedSegment(
        ext.ctxName, ext.ctxKind, inlineOptions.stripCtxName, inlineOptions.stripEventHandlers,
      );
      if (stripped) {
        const idx = earlyStrippedCounter++;
        const counter = 0xffff0000 + idx * 2;
        earlyQrlVarNames.set(ext.symbolName, `q_qrl_${counter}`);
      } else {
        earlyQrlVarNames.set(ext.symbolName, `q_${ext.symbolName}`);
      }
    }
  }

  /**
   * Get the QRL variable name for a symbol, accounting for stripped segments.
   */
  function getQrlVarName(symbolName: string): string {
    return earlyQrlVarNames.get(symbolName) ?? `q_${symbolName}`;
  }

  // -----------------------------------------------------------------------
  // Step 4: Rewrite call sites (only top-level extractions)
  // -----------------------------------------------------------------------
  const eventHandlerExtraImports: Array<{ sym: string; src: string }> = [];
  for (const ext of topLevel) {
    if (ext.isSync) {
      // sync$: replace entire call with _qrlSync(original, "minified")
      s.overwrite(ext.callStart, ext.callEnd, buildSyncTransform(ext.bodyText));
    } else if (ext.isInlinedQrl) {
      // inlinedQrl(body, name, [captures]): replace entire call with QRL variable name.
      // The .w([captures]) wrapping is handled in Step 4b-inlinedQrl below.
      s.overwrite(ext.callStart, ext.callEnd, getQrlVarName(ext.symbolName));
    } else if (ext.isBare) {
      // Bare $(): replace entire call with QRL variable name
      s.overwrite(ext.callStart, ext.callEnd, getQrlVarName(ext.symbolName));
    } else if (ext.ctxKind === 'eventHandler' && !ext.qrlCallee) {
      // Direct JSX event handler attribute: onClick$={fn} -> q-e:click={q_var} (or onClick$={q_var} for components)
      // Named markers inside JSX attrs (onClick$={server$(...)}) have qrlCallee set and
      // their callStart..callEnd only covers the call expression, so they use the named marker path.
      let propName: string;
      if (ext.isComponentEvent) {
        propName = ext.ctxName;
      } else {
        const transformedPropName = transformEventPropName(ext.ctxName, new Set());
        propName = transformedPropName ?? ext.ctxName;
      }

      // For regCtxName-matched extractions, wrap the QRL var in serverQrl()
      const isRegCtx = matchesRegCtxName(ext, inlineOptions?.regCtxName);
      let qrlRef = isRegCtx ? `serverQrl(${getQrlVarName(ext.symbolName)})` : getQrlVarName(ext.symbolName);
      if (isRegCtx) {
        eventHandlerExtraImports.push({ sym: 'serverQrl', src: '@qwik.dev/core' });
      }

      // Add .w([captures]) for captured variables
      if (!isRegCtx && ext.captureNames.length > 0) {
        qrlRef += '.w([\n        ' + ext.captureNames.join(',\n        ') + '\n    ])';
      }

      const replacement = `${propName}={${qrlRef}}`;
      s.overwrite(ext.callStart, ext.callEnd, replacement);
    } else {
      // Named marker (component$, useTask$, etc.)
      // Replace callee
      s.overwrite(ext.calleeStart, ext.calleeEnd, ext.qrlCallee);
      // Replace argument with QRL variable name
      s.overwrite(ext.argStart, ext.argEnd, getQrlVarName(ext.symbolName));
      // Add PURE annotation for componentQrl calls.
      // Use prependRight so the annotation survives if Step 4a removes
      // the preceding `const varName = ` for unused bindings.
      if (needsPureAnnotation(ext.qrlCallee)) {
        s.prependRight(ext.callStart, '/*#__PURE__*/ ');
      }
    }
  }

  // -----------------------------------------------------------------------
  // Step 4-noarg: Rewrite marker calls with no arguments
  // -----------------------------------------------------------------------
  // Marker calls like `component$()` with no arguments don't create an extraction
  // (no body to extract), but the callee still needs to be renamed to its Qrl form.
  // Walk the AST to find such calls and rewrite them.
  const noArgQrlCallees: Array<{ callee: string; source: string }> = [];
  {
    const extractedCallStarts = new Set(extractions.map(e => e.callStart));
    function walkNoArgMarkers(node: any): void {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) { for (const item of node) walkNoArgMarkers(item); return; }
      if (node.type === 'CallExpression' && !extractedCallStarts.has(node.start)) {
        const calleeName = node.callee?.type === 'Identifier' ? node.callee.name : null;
        if (calleeName) {
          const importInfo = originalImports.get(calleeName);
          if (importInfo && importInfo.importedName.endsWith('$') &&
              importInfo.importedName !== '$' && importInfo.importedName !== 'sync$') {
            // Only handle calls with truly 0 arguments
            if (!node.arguments || node.arguments.length === 0) {
              const qrlCallee = importInfo.importedName.slice(0, -1) + 'Qrl';
              s.overwrite(node.callee.start, node.callee.end, qrlCallee);
              if (needsPureAnnotation(qrlCallee)) {
                s.prependRight(node.start, '/*#__PURE__*/ ');
              }
              extractedCalleeNames.add(importInfo.importedName);
              // Store for later import generation
              noArgQrlCallees.push({ callee: qrlCallee, source: importInfo.source });
              if (!alreadyImported.has(qrlCallee)) {
                alreadyImported.add(qrlCallee);
              }
            }
          }
        }
      }
      for (const key of Object.keys(node)) {
        if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'range') continue;
        walkNoArgMarkers(node[key]);
      }
    }
    walkNoArgMarkers(program.body);
  }

  // -----------------------------------------------------------------------
  // Step 4a: Remove unused variable bindings wrapping QRL call sites
  // -----------------------------------------------------------------------
  // When a variable declaration like `const foo = component$(...)` is:
  // 1. NOT exported
  // 2. NOT referenced elsewhere in the module body
  // Then the Rust optimizer strips `const foo = `, leaving just the call expression.
  // For bare $() calls on unused bindings, SWC also skips the separate QRL const
  // declaration and inlines the qrl() call directly.
  // Only active when minify is not 'none' (Rust optimizer's simplify mode).
  const inlinedQrlSymbols = new Set<string>(); // symbols that should NOT get separate QRL const decls
  if (minify !== 'none') {
    for (const stmt of program.body) {
      // Skip exported declarations
      if (stmt.type === 'ExportNamedDeclaration') continue;
      if (stmt.type !== 'VariableDeclaration') continue;

      const decl = stmt;
      if (!decl.declarations || decl.declarations.length !== 1) continue;

      const declarator = decl.declarations[0];
      if (!declarator.init) continue;

      // Check if ANY top-level extraction's call site is within or IS this declarator's init.
      const initStart = declarator.init.start;
      const initEnd = declarator.init.end;
      const matchingExtractions = topLevel.filter(
        (ext) => !ext.isSync &&
          ext.callStart >= initStart && ext.callEnd <= initEnd,
      );

      // Also check if init is a pre-existing inlinedQrl(null, ...) call.
      const isInlinedQrlCall = declarator.init.type === 'CallExpression' &&
        declarator.init.callee?.type === 'Identifier' &&
        declarator.init.callee.name === 'inlinedQrl';

      if (matchingExtractions.length === 0 && !isInlinedQrlCall) continue;

      // The variable name
      const varName = declarator.id?.type === 'Identifier' ? declarator.id.name : null;
      if (!varName) continue;

      // Check if varName is referenced elsewhere in the module body
      // (excluding the declaration itself and import sections).
      const wordBoundaryRegex = new RegExp(`\\b${varName}\\b`);
      let bodyText = '';
      for (const bodyStmt of program.body) {
        if (bodyStmt.type === 'ImportDeclaration') continue;
        if (bodyStmt === decl) continue;
        bodyText += source.slice(bodyStmt.start, bodyStmt.end) + '\n';
      }

      if (!wordBoundaryRegex.test(bodyText)) {
        // Variable is not used elsewhere: strip `const/let/var varName = ` prefix
        // Remove from declaration start to the init start
        s.remove(decl.start, initStart);

        // For bare $() extractions on unused bindings, mark them for inline QRL
        // (skip separate QRL const declaration, inline the qrl() call directly)
        // BUT only if the $() call IS the entire init expression -- when it's wrapped
        // in another call like component($(...)), the QRL should still be hoisted.
        for (const ext of matchingExtractions) {
          if (ext.isBare && ext.callStart === initStart && ext.callEnd === initEnd) {
            inlinedQrlSymbols.add(ext.symbolName);
          }
        }
      }
    }
  }

  // Step 4a-2: For inlined QRL symbols, replace the call site with the full qrl() expression
  // instead of a reference to a QRL const (which won't exist).
  for (const ext of topLevel) {
    if (!inlinedQrlSymbols.has(ext.symbolName)) continue;
    // The call site was already replaced with `q_symbolName` in Step 4.
    // Now overwrite it with the inline qrl() expression.
    const inlineExt = explicitExtensions ? (outputExtension ?? '.js') : '';
    const inlineQrl = `/*#__PURE__*/ qrl(()=>import("./${ext.canonicalFilename}${inlineExt}"), "${ext.symbolName}")`;
    s.overwrite(ext.callStart, ext.callEnd, inlineQrl);
  }

  // -----------------------------------------------------------------------
  // Step 4b: .w() wrapping for captures (CAPT-03)
  // -----------------------------------------------------------------------
  // Build a Set of migrated variable names (reexported as _auto_ OR moved into segment)
  // to suppress from .w() capture wrapping. Reexported vars are exposed via
  // `export { x as _auto_x }`, and moved vars are physically inlined into the segment.
  // Neither needs redundant .w() wrapping.
  const migratedNames = new Set(
    (migrationDecisions ?? [])
      .filter(d => d.action === 'reexport' || d.action === 'move')
      .map(d => d.varName),
  );

  for (const ext of topLevel) {
    if (ext.isSync) continue;

    if (ext.isInlinedQrl) {
      // inlinedQrl: use explicit capture array (includes non-identifier values like true)
      if (!ext.explicitCaptures) continue;
      // Parse the capture array items from the source text
      const captureItems = parseArrayItems(ext.explicitCaptures);
      if (captureItems.length === 0) continue;
      const wrapVars = captureItems.join(',\n    ');
      const wText = `.w([\n    ${wrapVars}\n])`;
      // inlinedQrl: entire call was replaced with QRL var name at callStart..callEnd
      s.appendLeft(ext.callEnd, wText);
      continue;
    }

    if (ext.captureNames.length === 0) continue;

    // Filter out migrated (_auto_) variables from captures
    const effectiveCaptures = ext.captureNames.filter(name => !migratedNames.has(name));
    if (effectiveCaptures.length === 0) continue; // skip .w() entirely

    // Build the .w() call: .w([\n        var1,\n        var2\n    ])
    const wrapVars = effectiveCaptures.join(',\n        ');
    const wText = `.w([\n        ${wrapVars}\n    ])`;

    if (ext.isBare) {
      // Bare $(): entire call was replaced with QRL var name at callStart..callEnd
      s.appendLeft(ext.callEnd, wText);
    } else {
      // Named marker: arg was replaced with QRL var name at argStart..argEnd
      s.appendLeft(ext.argEnd, wText);
    }
  }

  // -----------------------------------------------------------------------
  // Step 4c: JSX transformation (Phase 4)
  // -----------------------------------------------------------------------
  const isDevMode = mode === 'dev';
  let jsxResult: JsxTransformOutput | null = null;
  let jsxKeyCounterValue = 0; // Track the JSX key counter across module + body transforms
  if (jsxOptions?.enableJsx) {
    // Build skip ranges from extraction argument ranges.
    // These regions have already been rewritten (e.g., $() argument replaced with q_symbolName)
    // so the JSX transform must not try to overwrite nodes within them.
    const skipRanges = topLevel.map((ext) => ({
      start: ext.argStart,
      end: ext.argEnd,
    }));
    // Run JSX transform on the same magic-string instance.
    // This converts JSX elements/fragments to _jsxSorted/_jsxSplit calls.
    // Must run AFTER call site rewriting (so $() calls are replaced)
    // but BEFORE import assembly (so we can add JSX imports).
    jsxResult = transformAllJsx(
      source, s, program, jsxOptions.importedNames, skipRanges,
      isDevMode ? { relPath } : undefined,
      undefined, // keyCounterStart
      jsxOptions.enableSignals !== false, // disable signal analysis when no extractions
      undefined, // qpOverrides
      undefined, // qrlsWithCaptures
      undefined, // paramNames
      relPath,   // for key prefix derivation
    );
    jsxKeyCounterValue = jsxResult.keyCounterValue;
  }

  // -----------------------------------------------------------------------
  // Step 5: Build optimizer-added imports (IMP-04)
  // -----------------------------------------------------------------------
  const neededImports = new Map<string, string>(); // symbol -> source
  const isInline = inlineOptions?.inline === true;

  // For inline/hoist: ALL non-sync extractions (including nested) contribute imports.
  // For other strategies: only top-level extractions contribute imports to the parent module.
  const hasTopLevelNonSync = topLevel.some((e) => !e.isSync);
  const hasAnyNonSync = extractions.some((e) => !e.isSync);

  if (isInline) {
    // Inline strategy: import _noopQrl or _noopQrlDEV instead of qrl/qrlDEV
    if (hasAnyNonSync) {
      const noopSymbol = isDevMode ? '_noopQrlDEV' : '_noopQrl';
      if (!alreadyImported.has(noopSymbol)) {
        neededImports.set(noopSymbol, '@qwik.dev/core');
      }
    }
    // _captures import needed if any non-stripped extraction has captures
    // (checked across ALL extractions, not just top-level)
    const needsCapturesImport = extractions.some(
      (e) => !e.isSync && e.captureNames.length > 0 && !(inlineOptions && isStrippedSegment(
        e.ctxName, e.ctxKind, inlineOptions.stripCtxName, inlineOptions.stripEventHandlers,
      )),
    );
    if (needsCapturesImport && !alreadyImported.has('_captures')) {
      neededImports.set('_captures', '@qwik.dev/core');
    }
  } else if (inlineOptions && !inlineOptions.inline) {
    // Non-inline with strip: still use qrl/qrlDEV for non-stripped, _noopQrl for stripped
    if (hasTopLevelNonSync) {
      // Check if there are non-stripped segments that need qrl
      const hasNonStripped = topLevel.some(
        (e) => !e.isSync && !isStrippedSegment(
          e.ctxName, e.ctxKind, inlineOptions.stripCtxName, inlineOptions.stripEventHandlers,
        ),
      );
      const hasStripped = topLevel.some(
        (e) => !e.isSync && isStrippedSegment(
          e.ctxName, e.ctxKind, inlineOptions.stripCtxName, inlineOptions.stripEventHandlers,
        ),
      );
      if (hasNonStripped) {
        const qrlSymbol = isDevMode ? 'qrlDEV' : 'qrl';
        if (!alreadyImported.has(qrlSymbol)) {
          neededImports.set(qrlSymbol, '@qwik.dev/core');
        }
      }
      if (hasStripped) {
        const noopSymbol = isDevMode ? '_noopQrlDEV' : '_noopQrl';
        if (!alreadyImported.has(noopSymbol)) {
          neededImports.set(noopSymbol, '@qwik.dev/core');
        }
      }
    }
  } else {
    // Default: no inline, no strip
    if (hasTopLevelNonSync) {
      const qrlSymbol = isDevMode ? 'qrlDEV' : 'qrl';
      if (!alreadyImported.has(qrlSymbol)) {
        neededImports.set(qrlSymbol, '@qwik.dev/core');
      }
      // inlinedQrl in lib mode for local files uses qrlDEV even when not in dev mode
      const hasInlinedQrlLocal = topLevel.some(
        (e) => e.isInlinedQrl && !relPath.includes('node_modules'),
      );
      if (hasInlinedQrlLocal && !isDevMode && !alreadyImported.has('qrlDEV')) {
        neededImports.set('qrlDEV', '@qwik.dev/core');
      }
    }
  }

  // Each unique qrlCallee from top-level extractions needs an import
  for (const ext of topLevel) {
    if (ext.isSync) {
      // _qrlSync import
      if (!alreadyImported.has('_qrlSync')) {
        neededImports.set('_qrlSync', '@qwik.dev/core');
      }
      continue;
    }
    if (ext.isBare) {
      // bare $ doesn't need a Qrl wrapper import, but inlined bare QRLs need `qrl` import
      if (inlinedQrlSymbols.has(ext.symbolName) && !alreadyImported.has('qrl')) {
        neededImports.set('qrl', '@qwik.dev/core');
      }
      continue;
    }

    const qrlCallee = ext.qrlCallee;
    if (qrlCallee && !alreadyImported.has(qrlCallee)) {
      // Only add import if not custom inlined (custom inlined are locally defined)
      if (!isCustomInlined(ext, originalImports)) {
        neededImports.set(qrlCallee, getQrlImportSource(qrlCallee, ext.importSource));
      }
    }
  }

  // Add imports for no-arg marker call rewrites (Step 4-noarg)
  for (const { callee, source } of noArgQrlCallees) {
    if (!neededImports.has(callee)) {
      neededImports.set(callee, getQrlImportSource(callee, source));
    }
  }

  // Add imports for top-level event handler rewrites (Step 4 event handlers)
  for (const { sym, src } of eventHandlerExtraImports) {
    if (!alreadyImported.has(sym) && !neededImports.has(sym)) {
      neededImports.set(sym, src);
    }
  }

  // Add JSX transform imports (Phase 4)
  if (jsxResult) {
    for (const sym of jsxResult.neededImports) {
      if (!alreadyImported.has(sym)) {
        neededImports.set(sym, '@qwik.dev/core');
      }
    }
    if (jsxResult.needsFragment && !alreadyImported.has('_Fragment')) {
      neededImports.set('Fragment as _Fragment', '@qwik.dev/core/jsx-runtime');
    }
    // Hoisted signal declarations (_hf0, _hf0_str, etc.) need to be added
    // They will be prepended after imports in the preamble assembly step
  }

  // NOTE: Import statement generation is deferred until after Step 5c,
  // because transformSCallBody() in Step 5c may add additional imports
  // (e.g., Qrl-suffixed callee imports like useStylesQrl, useBrowserVisibleTaskQrl).

  // -----------------------------------------------------------------------
  // Step 5b: Build QRL declarations
  // -----------------------------------------------------------------------
  // For inline/hoist strategy: ALL non-sync extractions (including nested) get QRL declarations.
  // For other strategies: only top-level (non-nested) non-sync extractions.
  const topLevelNonSync = extractions.filter((e) => !e.isSync && e.parent === null && !inlinedQrlSymbols.has(e.symbolName));
  const allNonSync = extractions.filter((e) => !e.isSync && !inlinedQrlSymbols.has(e.symbolName));

  // Track stripped segment counter for sentinel naming
  let strippedCounter = 0;
  // Map symbolName -> QRL variable name (for .s() calls and call site references)
  const qrlVarNames = new Map<string, string>();

  const qrlDecls: string[] = [];

  if (isInline) {
    // Inline/hoist strategy: _noopQrl declarations for ALL non-sync extractions
    for (const ext of allNonSync) {
      const stripped = inlineOptions && isStrippedSegment(
        ext.ctxName, ext.ctxKind, inlineOptions.stripCtxName, inlineOptions.stripEventHandlers,
      );

      if (stripped) {
        const idx = strippedCounter++;
        if (isDevMode && devFilePath) {
          qrlDecls.push(buildStrippedNoopQrlDev(ext.symbolName, idx, {
            file: devFilePath,
            lo: 0,
            hi: 0,
            displayName: ext.displayName,
          }));
        } else {
          qrlDecls.push(buildStrippedNoopQrl(ext.symbolName, idx));
        }
        // Sentinel variable name for stripped segments
        const counter = 0xffff0000 + idx * 2;
        qrlVarNames.set(ext.symbolName, `q_qrl_${counter}`);
      } else {
        if (isDevMode && devFilePath) {
          qrlDecls.push(buildNoopQrlDevDeclaration(ext.symbolName, {
            file: devFilePath,
            lo: ext.argStart,
            hi: ext.argEnd,
            displayName: ext.displayName,
          }));
        } else {
          qrlDecls.push(buildNoopQrlDeclaration(ext.symbolName));
        }
        qrlVarNames.set(ext.symbolName, `q_${ext.symbolName}`);
      }
    }
  } else if (inlineOptions && !inlineOptions.inline) {
    // Non-inline with strip: stripped segments get _noopQrl, others get qrl
    for (const ext of topLevelNonSync) {
      const stripped = isStrippedSegment(
        ext.ctxName, ext.ctxKind, inlineOptions.stripCtxName, inlineOptions.stripEventHandlers,
      );

      if (stripped) {
        const idx = strippedCounter++;
        if (isDevMode && devFilePath) {
          qrlDecls.push(buildStrippedNoopQrlDev(ext.symbolName, idx, {
            file: devFilePath,
            lo: 0,
            hi: 0,
            displayName: ext.displayName,
          }));
        } else {
          qrlDecls.push(buildStrippedNoopQrl(ext.symbolName, idx));
        }
        const counter = 0xffff0000 + idx * 2;
        qrlVarNames.set(ext.symbolName, `q_qrl_${counter}`);
      } else {
        if (isDevMode && devFilePath) {
          qrlDecls.push(buildQrlDevDeclaration(
            ext.symbolName,
            ext.canonicalFilename,
            devFilePath,
            ext.loc[0],
            ext.loc[1],
            ext.displayName,
          ));
        } else {
          qrlDecls.push(buildQrlDeclaration(ext.symbolName, ext.canonicalFilename, explicitExtensions, ext.extension, outputExtension));
        }
        qrlVarNames.set(ext.symbolName, `q_${ext.symbolName}`);
      }
    }
  } else {
    // Default: standard qrl declarations
    for (const ext of topLevelNonSync) {
      if (isDevMode && devFilePath) {
        qrlDecls.push(buildQrlDevDeclaration(
          ext.symbolName,
          ext.canonicalFilename,
          devFilePath,
          ext.loc[0],
          ext.loc[1],
          ext.displayName,
        ));
      } else if (ext.isInlinedQrl && !relPath.includes('node_modules')) {
        // inlinedQrl in lib/test mode for local files: use qrlDEV with byte-offset loc
        // The Rust optimizer always uses qrlDEV for inlinedQrl in Test mode
        // when the file is not in node_modules
        const inlinedDevFile = devFilePath ?? buildDevFilePath(relPath, '', undefined);
        qrlDecls.push(buildQrlDevDeclaration(
          ext.symbolName,
          ext.canonicalFilename,
          inlinedDevFile,
          ext.loc[0],
          ext.loc[1],
          ext.displayName,
        ));
      } else {
        qrlDecls.push(buildQrlDeclaration(ext.symbolName, ext.canonicalFilename, explicitExtensions, ext.extension, outputExtension));
      }
      qrlVarNames.set(ext.symbolName, `q_${ext.symbolName}`);
    }
  }

  // Sort QRL declarations for deterministic output
  qrlDecls.sort();

  // -----------------------------------------------------------------------
  // Step 5c: Build .s() calls for inline/hoist strategy
  // -----------------------------------------------------------------------
  const sCalls: string[] = [];
  const inlineHoistedDeclarations: string[] = [];
  // Use hoist-to-const pattern when:
  // 1. entryType is explicitly 'hoist', OR
  // 2. entryType is 'inline' but both transpileTs and transpileJsx are enabled
  //    AND mode is NOT 'dev' (dev mode always uses inline .s() format)
  const isHoist = inlineOptions?.entryType === 'hoist' ||
    (inlineOptions?.entryType === 'inline' && !!transpileTs && !!jsxOptions?.enableJsx && mode !== 'dev');
  if (isInline) {
    // Build JSX options for inline body transformation (if JSX is enabled)
    // For hoist strategy, pass the current key counter so body keys continue
    // from the module-level counter (ensuring sequential u6_N numbering).
    let sCallJsxOptions: SCallBodyJsxOptions | undefined = jsxOptions?.enableJsx
      ? {
          enableJsx: true,
          importedNames: jsxOptions.importedNames,
          devOptions: isDevMode ? { relPath } : undefined,
          keyCounterStart: isHoist ? jsxKeyCounterValue : undefined,
          relPath,
        }
      : undefined;

    // Shared signal hoister for all inline/hoist body JSX transforms.
    // Ensures _hf counter is sequential across components (no duplicate _hf0).
    const sharedHoister = jsxOptions?.enableJsx ? new SignalHoister() : undefined;

    // ALL non-sync, non-stripped extractions get .s() calls (including nested).
    // Order: nested extractions first (in extraction order per parent group),
    // then top-level non-component, then top-level component.
    const nestedExts: ExtractionResult[] = [];
    const topNonComponent: ExtractionResult[] = [];
    const topComponent: ExtractionResult[] = [];

    for (const ext of allNonSync) {
      const isStrippedExt = inlineOptions && isStrippedSegment(
        ext.ctxName, ext.ctxKind, inlineOptions.stripCtxName, inlineOptions.stripEventHandlers,
      );
      if (isStrippedExt) continue; // Stripped segments: no .s() call

      if (ext.parent !== null) {
        nestedExts.push(ext);
      } else if (ext.ctxName === 'component') {
        topComponent.push(ext);
      } else {
        topNonComponent.push(ext);
      }
    }

    // For hoist strategy: find the containing statement for each extraction
    // so we can insert const + .s() before it in the body.
    // Map symbolName -> statement start position in original source
    const extContainingStmtStart = new Map<string, number>();
    if (isHoist) {
      for (const ext of allNonSync) {
        // Find the program.body statement that contains this extraction's callStart
        for (const stmt of program.body) {
          if (stmt.type === 'ImportDeclaration') continue;
          if (ext.callStart >= stmt.start && ext.callStart < stmt.end) {
            extContainingStmtStart.set(ext.symbolName, stmt.start);
            break;
          }
        }
      }
    }

    /**
     * Process a single extraction: build the .s() call (inline) or
     * const + .s(varName) (hoist), collecting imports and hoisted decls.
     */
    const processExtraction = (ext: ExtractionResult) => {
      const varName = qrlVarNames.get(ext.symbolName) ?? `q_${ext.symbolName}`;
      const { transformedBody: rawBody, additionalImports, hoistedDeclarations, keyCounterValue } = transformSCallBody(
        ext, extractions, qrlVarNames, sCallJsxOptions, inlineOptions?.regCtxName, sharedHoister,
      );

      // Wrap body with _regSymbol for regCtxName-matched extractions
      const isRegCtxMatch = matchesRegCtxName(ext, inlineOptions?.regCtxName);
      let transformedBody = rawBody;
      if (isRegCtxMatch) {
        // Wrap: _regSymbol(() => body, "hash")
        // with /*#__PURE__*/ annotation
        transformedBody = `/*#__PURE__*/ _regSymbol(${rawBody}, "${ext.hash}")`;
        neededImports.set('_regSymbol', '@qwik.dev/core');
      }
      // For hoist strategy, advance the key counter after each body transform
      if (isHoist && keyCounterValue !== undefined && sCallJsxOptions) {
        jsxKeyCounterValue = keyCounterValue;
        sCallJsxOptions = { ...sCallJsxOptions, keyCounterStart: jsxKeyCounterValue };
      }
      inlineHoistedDeclarations.push(...hoistedDeclarations);
      for (const [sym, src] of additionalImports) {
        if (!alreadyImported.has(sym) && !neededImports.has(sym)) {
          neededImports.set(sym, src);
        }
      }

      // regCtxName-matched extractions use inline .s(_regSymbol(...)) pattern
      // when the entry type is 'inline' (even if auto-promoted to hoist).
      // When explicitly 'hoist', they use the normal hoist const + .s() pattern.
      const forceInlineForRegCtx = isRegCtxMatch && inlineOptions?.entryType === 'inline';
      if (isHoist && !forceInlineForRegCtx) {
        // Hoist strategy: insert const declaration + .s(varName) before
        // the containing statement in the body via magic-string.
        // Strip TypeScript type annotations from the body text since hoist
        // output is emitted as .js (TS types would cause parse errors).
        let hoistBody = transformedBody;
        try {
          const stripped = oxcTransformSync('__body__.tsx', hoistBody);
          if (stripped.code && !stripped.errors?.length) {
            hoistBody = stripped.code;
            // Strip trailing semicolon added by transform
            if (hoistBody.endsWith(';\n')) hoistBody = hoistBody.slice(0, -2);
            else if (hoistBody.endsWith(';')) hoistBody = hoistBody.slice(0, -1);
          }
        } catch {
          // If TS stripping fails, use original body
        }
        const constDecl = buildHoistConstDecl(ext.symbolName, hoistBody);
        const sCall = buildHoistSCall(varName, ext.symbolName);
        const stmtStart = extContainingStmtStart.get(ext.symbolName);
        if (stmtStart !== undefined) {
          s.appendLeft(stmtStart, constDecl + '\n' + sCall + '\n');
        } else {
          // Fallback: put in preamble if no containing statement found
          sCalls.push(constDecl);
          sCalls.push(sCall);
        }
      } else {
        // Inline strategy: put body inside .s() call in preamble
        sCalls.push(buildSCall(varName, transformedBody));
      }
    };

    // Emit nested .s() calls first
    for (const ext of nestedExts) {
      processExtraction(ext);
    }

    // Then top-level non-component .s() calls
    for (const ext of topNonComponent) {
      processExtraction(ext);
    }

    // Component .s() calls last
    for (const ext of topComponent) {
      processExtraction(ext);
    }

    // For shared hoister: replace per-body _hf declarations with deduplicated set
    if (sharedHoister) {
      inlineHoistedDeclarations.length = 0;
      inlineHoistedDeclarations.push(...sharedHoister.getDeclarations());
    }
  }

  // -----------------------------------------------------------------------
  // Step 5d: Build import statements (deferred from Step 5 to include
  // additional imports discovered during Step 5c body transformation)
  // NOTE: Import order follows Map insertion order (discovery order),
  // matching SWC's Vec<(Id, Import)> insertion ordering.
  // -----------------------------------------------------------------------
  const sortedImports = Array.from(neededImports.entries());

  const importStatements = sortedImports.map(
    ([symbol, src]) => `import { ${symbol} } from "${src}";`,
  );

  // -----------------------------------------------------------------------
  // Step 5e: Filter surviving user imports to remove unused specifiers.
  // After extraction, some imported identifiers are only used inside segment
  // bodies and are no longer referenced in the parent module body.
  // The SWC optimizer strips these; we must do the same.
  // -----------------------------------------------------------------------
  if (survivingUserImports.length > 0 && survivingImportInfos.length > 0) {
    // Get the current body text (after all magic-string edits)
    const bodyText = s.toString();
    // Also include QRL declarations and .s() calls in the reference check,
    // since they may reference identifiers from surviving imports
    const allPreambleText = [...qrlDecls, ...sCalls, ...inlineHoistedDeclarations].join('\n');
    const fullRefText = bodyText + '\n' + allPreambleText;

    for (let idx = survivingUserImports.length - 1; idx >= 0; idx--) {
      const info = survivingImportInfos[idx];
      // Never filter side-effect imports, namespace imports, or preserveAll imports
      // (preserveAll imports are kept intact per minify:'none' behavior)
      if (info.isSideEffect || info.nsPart || info.preservedAll) continue;

      // Check default import
      let defaultUsed = false;
      if (info.defaultPart) {
        const re = new RegExp(`\\b${info.defaultPart}\\b`);
        defaultUsed = re.test(fullRefText);
      }

      // Check each named specifier
      const usedNamed: { local: string; imported: string }[] = [];
      for (const np of info.namedParts) {
        const re = new RegExp(`\\b${np.local}\\b`);
        if (re.test(fullRefText)) {
          usedNamed.push(np);
        }
      }

      // If nothing is used, remove entirely
      if (!defaultUsed && usedNamed.length === 0 && !info.nsPart) {
        survivingUserImports.splice(idx, 1);
        survivingImportInfos.splice(idx, 1);
        continue;
      }

      // If some named specifiers were dropped, rebuild the import
      if (usedNamed.length < info.namedParts.length) {
        const namedStrs = usedNamed.map(np =>
          np.imported !== np.local ? `${np.imported} as ${np.local}` : np.local
        );
        let importParts = '';
        const dp = defaultUsed ? info.defaultPart : '';
        if (namedStrs.length > 0) {
          importParts = dp
            ? `${dp}, { ${namedStrs.join(', ')} }`
            : `{ ${namedStrs.join(', ')} }`;
        } else if (dp) {
          importParts = dp;
        }
        if (importParts) {
          survivingUserImports[idx] = `import ${importParts} from ${info.quote}${info.source}${info.quote};`;
          survivingImportInfos[idx] = { ...info, namedParts: usedNamed, defaultPart: dp };
        } else {
          survivingUserImports.splice(idx, 1);
          survivingImportInfos.splice(idx, 1);
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Step 6: Assemble final output
  // -----------------------------------------------------------------------
  // The modified body (with import rewrites and call rewrites) already comes from s.toString()
  // We need to prepend: imports + // + QRL decls + // + .s() calls (if inline)

  const preamble: string[] = [];
  if (importStatements.length > 0) {
    preamble.push(...importStatements);
  }
  // Add surviving user imports after optimizer imports (matching Rust ordering)
  if (survivingUserImports.length > 0) {
    preamble.push(...survivingUserImports);
  }
  // Add hoisted signal declarations (_hf0, _hf0_str, etc.) BEFORE QRL declarations.
  // Rust optimizer places signal hoists between first // separator and QRL declarations.
  const allHoistedDecls: string[] = [];
  if (jsxResult && jsxResult.hoistedDeclarations.length > 0) {
    allHoistedDecls.push(...jsxResult.hoistedDeclarations);
  }
  if (inlineHoistedDeclarations.length > 0) {
    allHoistedDecls.push(...inlineHoistedDeclarations);
  }
  if (allHoistedDecls.length > 0) {
    preamble.push('//');
    preamble.push(...allHoistedDecls);
  }
  if (qrlDecls.length > 0) {
    preamble.push('//');
    preamble.push(...qrlDecls);
  }
  // Add .s() calls for inline strategy (after QRL declarations, before body/exports)
  if (sCalls.length > 0) {
    preamble.push('//');
    preamble.push(...sCalls);
  } else {
    preamble.push('//');
  }

  s.prepend(preamble.join('\n') + '\n');

  // -----------------------------------------------------------------------
  // Step 6b: _auto_ exports (module-level migration)
  // -----------------------------------------------------------------------
  if (migrationDecisions) {
    for (const decision of migrationDecisions) {
      if (decision.action === 'reexport') {
        // Skip _auto_ re-export for variables that are already exported --
        // they can be imported directly by their original name from the parent module
        const decl = moduleLevelDecls?.find(d => d.name === decision.varName);
        if (decl?.isExported) continue;
        s.append(`\nexport { ${decision.varName} as _auto_${decision.varName} };`);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Step 6c: Remove migrated (moved) declarations from parent
  // -----------------------------------------------------------------------
  if (migrationDecisions && moduleLevelDecls) {
    // Track which ranges we've already removed to avoid double-removal
    // (multiple bindings from the same declaration)
    const removedRanges = new Set<string>();
    for (const decision of migrationDecisions) {
      if (decision.action !== 'move') continue;
      const decl = moduleLevelDecls.find((d) => d.name === decision.varName);
      if (!decl) continue;
      const rangeKey = `${decl.declStart}:${decl.declEnd}`;
      if (removedRanges.has(rangeKey)) continue;
      removedRanges.add(rangeKey);
      // Remove the declaration text including trailing newline
      let end = decl.declEnd;
      if (end < source.length && source[end] === '\n') end++;
      s.remove(decl.declStart, end);
    }
  }

  // -----------------------------------------------------------------------
  // Step 7: TS type stripping (final step, after all magic-string ops)
  // -----------------------------------------------------------------------
  let finalCode = s.toString();
  if (transpileTs) {
    // When transpileJsx is false (jsxOptions is undefined), use jsx:'preserve'
    // so oxc-transform strips TypeScript types but leaves JSX syntax intact.
    const tsStripOptions: Record<string, any> = { typescript: { onlyRemoveTypeImports: false } };
    if (!jsxOptions?.enableJsx) {
      tsStripOptions.jsx = 'preserve';
    }
    const stripped = oxcTransformSync('output.tsx', finalCode, tsStripOptions);
    if (stripped.code) {
      finalCode = stripped.code;
      // oxc-transform produces `let` for exported enum IIFEs, but Rust optimizer uses `var`.
      // Post-process: `let Thing = function(Thing)` -> `var Thing = function(Thing)`
      // Also handles: `export let Thing = ...` -> `export var Thing = ...`
      finalCode = finalCode.replace(
        /\b((?:export\s+)?)let\s+(\w+)\s*=\s*(\/\*[^*]*\*\/\s*)?function\s*\(\2\)/g,
        '$1var $2 = $3function($2)',
      );
    }
  }

  return {
    code: finalCode,
    extractions,
    jsxKeyCounterValue: jsxKeyCounterValue || undefined,
  };
}

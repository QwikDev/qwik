/**
 * Core extraction engine for the Qwik optimizer.
 *
 * Walks an AST to find marker calls ($-suffixed functions), extracts segment
 * info (body text, positions, metadata), and returns an array of ExtractionResult
 * objects. Each result contains everything needed to generate a segment module
 * and rewrite the parent module.
 */

import { parseSync } from 'oxc-parser';
import { walk } from 'oxc-walker';
import { qwikHash } from '../hashing/siphash.js';
import { ContextStack } from './context-stack.js';
import {
  collectImports,
  collectCustomInlined,
  getCalleeName,
  isMarkerCall,
  isSyncMarker,
  getCtxKind,
  getCtxName,
  type CustomInlinedInfo,
  type ImportInfo,
} from './marker-detection.js';
import { isEventProp, transformEventPropName, collectPassiveDirectives } from './event-handler-transform.js';
import { getBasename, getDirectory, getExtension, getFileStem } from './path-utils.js';

export interface ExtractionResult {
  // Identity
  symbolName: string;
  displayName: string;
  hash: string;
  canonicalFilename: string;

  // Positions in original source (for magic-string)
  callStart: number;
  callEnd: number;
  calleeStart: number;
  calleeEnd: number;
  argStart: number;
  argEnd: number;

  // Segment content
  bodyText: string;

  // Call form info
  calleeName: string;
  isBare: boolean;
  isSync: boolean;
  qrlCallee: string;
  importSource: string;

  // Metadata
  ctxKind: 'function' | 'eventHandler' | 'jSXProp';
  ctxName: string;
  origin: string;
  extension: string;
  loc: [number, number];
  parent: string | null;
  captures: boolean;

  // Capture analysis (Phase 3)
  captureNames: string[];
  paramNames: string[];

  // Imports needed by this segment
  segmentImports: ImportInfo[];

  // inlinedQrl support
  isInlinedQrl: boolean;
  explicitCaptures: string | null;
  inlinedQrlNameArg: string | null;

  // Component element event handler (uppercase tag like <CustomComponent onClick$={...}>)
  isComponentEvent: boolean;

  // Props field capture consolidation: maps original local name -> prop key name.
  // Set when captures from a parent component's destructured props are consolidated into _rawProps.
  propsFieldCaptures?: Map<string, string>;

  // Const literal values resolved from parent scope.
  // Maps captured variable name -> literal source text (e.g., "text" -> "'hola'").
  // These are inlined into the segment body and removed from captureNames.
  constLiterals?: Map<string, string>;
}

/**
 * Determine the file extension for a segment based on whether its body
 * contains JSX nodes.
 */
function determineExtension(argNode: any, sourceExt: string): string {
  let hasJsx = false;
  walk(argNode, {
    enter(node: any) {
      if (node.type === 'JSXElement' || node.type === 'JSXFragment') {
        hasJsx = true;
      }
    },
  });
  if (hasJsx) return '.tsx';
  if (sourceExt === '.ts') return '.ts';
  return '.js';
}

/** Resolve aliased import back to its original name (e.g., `c$` -> `component$`). */
function resolveCanonicalCalleeName(
  calleeName: string,
  imports: Map<string, ImportInfo>,
): string {
  const importInfo = imports.get(calleeName);
  return importInfo ? importInfo.importedName : calleeName;
}

/**
 * Bare $() segments inherit the wrapper call name as naming context,
 * e.g., component($(() => {})) -> "..._component".
 */
function getDirectWrapperContextName(
  node: any,
  parent: any,
  imports: Map<string, ImportInfo>,
  customInlined: Map<string, CustomInlinedInfo>,
): string | null {
  if (parent?.type !== 'CallExpression') return null;
  if (!Array.isArray(parent.arguments) || !parent.arguments.some((arg: any) => arg === node)) {
    return null;
  }
  if (isMarkerCall(parent, imports, customInlined)) return null;

  const wrapperCallee = getCalleeName(parent);
  if (!wrapperCallee) return null;

  return resolveCanonicalCalleeName(wrapperCallee, imports);
}

/** Map marker callee to its Qrl form: "$" -> "", "sync$" -> "_qrlSync", "component$" -> "componentQrl". */
function computeQrlCallee(calleeName: string): string {
  if (calleeName === '$') return '';
  if (calleeName === 'sync$') return '_qrlSync';
  return calleeName.slice(0, -1) + 'Qrl';
}

function computeLineCol(source: string, offset: number): [number, number] {
  let line = 1;
  let col = 1;
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source[i] === '\n') {
      line++;
      col = 1;
    } else {
      col++;
    }
  }
  return [line, col];
}

function collectIdentifiers(node: any): Set<string> {
  const ids = new Set<string>();
  walk(node, {
    enter(n: any) {
      if (n.type === 'Identifier') {
        ids.add(n.name);
      }
    },
  });
  return ids;
}

/** Return the subset of file-level imports referenced by identifiers in `bodyNode`. */
function collectSegmentImports(bodyNode: any, imports: Map<string, ImportInfo>): ImportInfo[] {
  const bodyIds = collectIdentifiers(bodyNode);
  const result: ImportInfo[] = [];
  for (const [localName, info] of imports) {
    if (bodyIds.has(localName)) {
      result.push(info);
    }
  }
  return result;
}

/** Check whether a JSX tag name represents a component (starts with uppercase). */
function isComponentTag(tagNode: any): boolean {
  if (tagNode?.type === 'JSXIdentifier') {
    const ch = tagNode.name[0];
    return ch === ch.toUpperCase() && ch !== ch.toLowerCase();
  }
  // Member expressions like Foo.Bar are always components
  return tagNode?.type === 'JSXMemberExpression';
}

/**
 * Extract all segments from a Qwik source file.
 *
 * Parses the source, walks the AST to find marker calls, and returns
 * an ExtractionResult for each one containing all info needed for
 * segment codegen and parent module rewriting.
 */
export function extractSegments(
  source: string,
  relPath: string,
  scope?: string,
  transpileJsx?: boolean,
  preParsedProgram?: any,
): ExtractionResult[] {
  const parseResult = preParsedProgram
    ? null
    : parseSync(relPath, source, { experimentalRawTransfer: true } as any);
  const program = preParsedProgram ?? parseResult!.program;

  const imports = collectImports(program, parseResult?.module);
  const customInlined = collectCustomInlined(program);

  const relDir = getDirectory(relPath);
  const fileStem = getFileStem(relPath) === 'index' && relDir
    ? getBasename(relDir)
    : getBasename(relPath);
  const sourceExt = getExtension(relPath) || '.js';
  const fileName = getBasename(relPath);
  const ctx = new ContextStack(fileStem, relPath, scope, fileName);

  const results: ExtractionResult[] = [];

  const pushedNodes = new Map<any, number>();
  const parentMap = new Map<any, any>();

  // Suppress JSX $-suffixed attribute extraction when a non-Qwik @jsxImportSource is set
  const hasNonQwikJsxImportSource = /\/\*\s*@jsxImportSource\s+(?!@qwik|@builder\.io\/qwik)\S+/.test(source);

  walk(program, {
    enter(node: any, parent: any) {
      if (parent) parentMap.set(node, parent);

      let pushCount = 0;

      if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier') {
        ctx.push(node.id.name);
        pushCount++;
      }

      if (node.type === 'FunctionDeclaration' && node.id) {
        ctx.push(node.id.name);
        pushCount++;
      }

      if (node.type === 'Property' && node.key?.type === 'Identifier') {
        ctx.push(node.key.name);
        pushCount++;
      }

      if (node.type === 'MethodDefinition' && node.key?.type === 'Identifier') {
        ctx.push(node.key.name);
        pushCount++;
      }

      // Non-marker $-suffixed calls still contribute to naming (e.g., useMemo$() -> "useMemo")
      if (node.type === 'CallExpression' && node.callee?.type === 'Identifier') {
        const calleeName = node.callee.name;
        if (calleeName.endsWith('$') && !isMarkerCall(node, imports, customInlined)) {
          ctx.push(calleeName.slice(0, -1)); // "useMemo$" -> "useMemo"
          pushCount++;
        }
      }

      // JSXElement: push tag name from the opening element.
      // We push on JSXElement (not JSXOpeningElement) so the tag name stays
      // on the context stack for all JSXElement children, including nested
      // JSXElements and JSXAttributes. JSXOpeningElement is a sibling of
      // children in the AST, so pushing there would pop before children.
      if (node.type === 'JSXElement' && node.openingElement) {
        const opening = node.openingElement;
        const tagName =
          opening.name?.type === 'JSXIdentifier'
            ? opening.name.name
            : opening.name?.type === 'JSXMemberExpression'
              ? opening.name.property?.name ?? ''
              : '';
        if (tagName) {
          ctx.push(tagName);
          pushCount++;
        }
      }

      // SWC's jsx plugin converts <> to jsx(Fragment, ...) before the optimizer,
      // so Fragment only enters naming context when transpileJsx is active.
      if (node.type === 'JSXFragment' && transpileJsx) {
        ctx.push('Fragment');
        pushCount++;
      }

      if (node.type === 'JSXAttribute') {
        let rawAttrName: string | null = null;
        if (node.name?.type === 'JSXIdentifier') {
          rawAttrName = node.name.name;
        } else if (node.name?.type === 'JSXNamespacedName') {
          rawAttrName = `${node.name.namespace?.name ?? ''}:${node.name.name?.name ?? ''}`;
        }

        if (rawAttrName) {
          if (rawAttrName.endsWith('$') && isEventProp(rawAttrName)) {
            const isComponentElement = parent?.type === 'JSXOpeningElement' && isComponentTag(parent.name);
            if (isComponentElement) {
              ctx.push(rawAttrName.slice(0, -1));
            } else {
              const jsxOpening = parent?.type === 'JSXOpeningElement' ? parent : null;
              const siblingAttrs = jsxOpening?.attributes ?? [];
              const passiveEvents = collectPassiveDirectives(siblingAttrs);
              const transformed = transformEventPropName(rawAttrName, passiveEvents);
              if (transformed) {
                ctx.push(transformed.replace(/[-:]/g, '_'));
              } else {
                ctx.push(rawAttrName);
              }
            }
          } else if (rawAttrName.endsWith('$') && rawAttrName.startsWith('host:')) {
            const stripped = rawAttrName.slice(5, -1);
            ctx.push('host_' + stripped);
          } else {
            ctx.push(rawAttrName);
          }
          pushCount++;
        }
      }

      if (node.type === 'ExportDefaultDeclaration') {
        const decl = node.declaration;
        const hasName =
          (decl?.type === 'FunctionDeclaration' && decl.id) ||
          (decl?.type === 'ClassDeclaration' && decl.id);
        if (!hasName) {
          ctx.pushDefaultExport();
          pushCount++;
        }
      }

      // inlinedQrl is a pre-processed QRL — must be detected before regular marker calls
      if (
        node.type === 'CallExpression' &&
        node.callee?.type === 'Identifier' &&
        (node.callee.name === 'inlinedQrl' || node.callee.name === '_inlinedQrl') &&
        imports.get(node.callee.name)?.isQwikCore &&
        node.arguments?.length >= 2
      ) {
        const calleeName = node.callee.name;
        const arg0 = node.arguments[0];
        const arg1 = node.arguments[1];
        const arg2 = node.arguments[2];

        const nameValue = arg1?.type === 'StringLiteral'
          ? arg1.value
          : (arg1?.type === 'Literal' && typeof arg1.value === 'string')
            ? arg1.value
            : null;

        const isNullBody = arg0 && (
          arg0.type === 'NullLiteral' ||
          (arg0.type === 'Literal' && arg0.value === null)
        );

        if (arg0 && nameValue && !isNullBody) {
          const bodyText = source.slice(arg0.start, arg0.end);

          // Split symbol name into display portion and hash portion
          const lastUnder = nameValue.lastIndexOf('_');
          let inlinedHash: string;
          let displayNameSuffix: string;
          if (lastUnder > 0) {
            const lastPart = nameValue.slice(lastUnder + 1);
            if (lastPart.length >= 8 && /^[a-zA-Z0-9]+$/.test(lastPart)) {
              inlinedHash = lastPart;
              displayNameSuffix = nameValue.slice(0, lastUnder);
            } else {
              inlinedHash = nameValue;
              displayNameSuffix = nameValue;
            }
          } else {
            inlinedHash = nameValue;
            displayNameSuffix = nameValue;
          }

          const inlinedDisplayName = fileStem + '_' + displayNameSuffix;
          const inlinedCanonicalFilename = inlinedDisplayName + '_' + inlinedHash;

          let explicitCapturesText: string | null = null;
          const inlinedCaptureNames: string[] = [];
          if (arg2 && (arg2.type === 'ArrayExpression' || arg2.type === 'ArrayPattern')) {
            explicitCapturesText = source.slice(arg2.start, arg2.end);
            for (const elem of arg2.elements ?? []) {
              if (elem?.type === 'Identifier') {
                inlinedCaptureNames.push(elem.name);
              }
            }
          }

          // Derive ctxName from wrapping Qrl call (e.g., componentQrl(...) -> "component$")
          let inlinedCtxName = nameValue;
          if (parent?.type === 'CallExpression') {
            const parentCallee = getCalleeName(parent);
            if (parentCallee) {
              const canonicalParentCallee = resolveCanonicalCalleeName(parentCallee, imports);
              if (canonicalParentCallee.endsWith('Qrl')) {
                inlinedCtxName = canonicalParentCallee.slice(0, -3) + '$';
              } else {
                inlinedCtxName = canonicalParentCallee;
              }
            }
          }

          const extension = sourceExt;

          results.push({
            symbolName: nameValue,
            displayName: inlinedDisplayName,
            hash: inlinedHash,
            canonicalFilename: inlinedCanonicalFilename,
            callStart: node.start,
            callEnd: node.end,
            calleeStart: node.callee.start,
            calleeEnd: node.callee.end,
            argStart: arg0.start,
            argEnd: arg0.end,
            bodyText,
            calleeName,
            isBare: false,
            isSync: false,
            qrlCallee: '',
            importSource: imports.get(calleeName)?.source ?? '@qwik.dev/core',
            ctxKind: 'function',
            ctxName: inlinedCtxName,
            origin: relPath,
            extension,
            loc: [arg0.start, arg0.end],
            parent: null,
            captures: inlinedCaptureNames.length > 0,
            captureNames: inlinedCaptureNames,
            paramNames: [],
            segmentImports: collectSegmentImports(arg0, imports),
            isInlinedQrl: true,
            explicitCaptures: explicitCapturesText,
            inlinedQrlNameArg: nameValue,
            isComponentEvent: false,
          });
        }

        if (pushCount > 0) pushedNodes.set(node, pushCount);
        return;
      }

      if (node.type === 'CallExpression' && isMarkerCall(node, imports, customInlined)) {
        const calleeName = getCalleeName(node);
        if (!calleeName) {
          if (pushCount > 0) pushedNodes.set(node, pushCount);
          return;
        }

        const canonicalCallee = resolveCanonicalCalleeName(calleeName, imports);

        const wrapperContext = canonicalCallee === '$'
          ? getDirectWrapperContextName(node, parent, imports, customInlined)
          : null;
        if (wrapperContext) {
          ctx.push(wrapperContext);
          pushCount++;
        }

        // SWC skips pushing the callee for bare $() — only wrapper context + counter matter
        if (canonicalCallee !== '$') {
          ctx.push(calleeName);
          pushCount++;
        }

        const arg = node.arguments?.[0];
        if (!arg) {
          if (pushCount > 0) pushedNodes.set(node, pushCount);
          return;
        }

        const bodyText = source.slice(arg.start, arg.end);
        const isBare = canonicalCallee === '$';
        const isSync = isSyncMarker(canonicalCallee);
        const qrlCallee = computeQrlCallee(canonicalCallee);

        // Detect if this $() call is inside a JSX attribute (CallExpr -> JSXExprContainer -> JSXAttr)
        let isEventAttr = false;
        let isJsxNonEventAttr = false;
        let attrCtx: string | undefined;

        if (parent?.type === 'JSXExpressionContainer') {
          const jsxAttrParent = parentMap.get(parent);
          if (jsxAttrParent?.type === 'JSXAttribute') {
            let jsxAttrName: string | null = null;
            if (jsxAttrParent.name?.type === 'JSXIdentifier') {
              jsxAttrName = jsxAttrParent.name.name;
            } else if (jsxAttrParent.name?.type === 'JSXNamespacedName') {
              jsxAttrName = `${jsxAttrParent.name.namespace?.name ?? ''}:${jsxAttrParent.name.name?.name ?? ''}`;
            }
            if (jsxAttrName?.endsWith('$')) {
              attrCtx = ctx.peek(1) ?? jsxAttrName;

              // Component elements use jSXProp for ALL $-suffixed attrs;
              // HTML elements use eventHandler for on* attrs.
              const jsxOpeningElement = parentMap.get(jsxAttrParent);
              const isComponentElement = jsxOpeningElement?.type === 'JSXOpeningElement'
                && isComponentTag(jsxOpeningElement.name);

              if (isComponentElement) {
                isEventAttr = false;
                isJsxNonEventAttr = true;
              } else {
                isEventAttr = jsxAttrName.startsWith('on') || jsxAttrName.startsWith('document:on') || jsxAttrName.startsWith('window:on');
                isJsxNonEventAttr = !isEventAttr;
              }
            }
          }
        }

        const ctxKind = getCtxKind(canonicalCallee, isEventAttr, isJsxNonEventAttr);
        const isJsxAttrContext = isEventAttr || isJsxNonEventAttr;
        const ctxName = getCtxName(canonicalCallee, isJsxAttrContext, isJsxAttrContext ? attrCtx : undefined);

        const displayName = ctx.getDisplayName();
        const symbolName = ctx.getSymbolName();

        const lastUnder = symbolName.lastIndexOf('_');
        const hash = lastUnder >= 0 ? symbolName.slice(lastUnder + 1) : symbolName;

        const extension = determineExtension(arg, sourceExt);
        const [line, col] = computeLineCol(source, arg.start);

        results.push({
          symbolName,
          displayName,
          hash,
          canonicalFilename: displayName + '_' + hash,
          callStart: node.start,
          callEnd: node.end,
          calleeStart: node.callee.start,
          calleeEnd: node.callee.end,
          argStart: arg.start,
          argEnd: arg.end,
          bodyText,
          calleeName: canonicalCallee,
          isBare,
          isSync,
          qrlCallee,
          importSource: imports.get(calleeName)?.source ?? '',
          ctxKind,
          ctxName,
          origin: relPath,
          extension,
          loc: [line, col],
          parent: null,
          captures: false,
          captureNames: [],
          paramNames: [],
          segmentImports: collectSegmentImports(arg, imports),
          isInlinedQrl: false,
          explicitCaptures: null,
          inlinedQrlNameArg: null,
          isComponentEvent: false,
        });
      }

      // JSX $-suffixed attribute extraction (e.g., onClick$={expr})
      let jsxAttrName: string | null = null;
      if (
        node.type === 'JSXAttribute' &&
        node.value?.type === 'JSXExpressionContainer' &&
        node.value.expression
      ) {
        if (node.name?.type === 'JSXIdentifier' && node.name.name.endsWith('$')) {
          jsxAttrName = node.name.name;
        } else if (node.name?.type === 'JSXNamespacedName') {
          const full = `${node.name.namespace?.name ?? ''}:${node.name.name?.name ?? ''}`;
          if (full.endsWith('$')) {
            jsxAttrName = full;
          }
        }
      }
      if (jsxAttrName !== null && !hasNonQwikJsxImportSource) {
        const attrName = jsxAttrName;
        const expr = node.value.expression;

        if (expr.type === 'CallExpression' && isMarkerCall(expr, imports, customInlined)) {
          // Handled by marker call detection above
        } else if (
          expr.type === 'ArrowFunctionExpression' ||
          expr.type === 'FunctionExpression'
        ) {
          const bodyText = source.slice(expr.start, expr.end);

          const isComponentEvent = parent?.type === 'JSXOpeningElement' && isComponentTag(parent.name);

          // HTML elements: all $-attrs -> eventHandler; components: on* -> eventHandler, rest -> jSXProp
          let ctxKind: 'function' | 'eventHandler' | 'jSXProp' = 'eventHandler';
          if (isComponentEvent) {
            const isOnEvent = attrName.startsWith('on') || attrName.startsWith('document:on') || attrName.startsWith('window:on');
            if (!isOnEvent) {
              ctxKind = 'jSXProp';
            }
          }
          const ctxName = attrName;

          const displayName = ctx.getDisplayName();
          const symbolName = ctx.getSymbolName();

          const lastUnder = symbolName.lastIndexOf('_');
          const hash = lastUnder >= 0 ? symbolName.slice(lastUnder + 1) : symbolName;

          const extension = determineExtension(expr, sourceExt);
          const [line, col] = computeLineCol(source, expr.start);

          results.push({
            symbolName,
            displayName,
            hash,
            canonicalFilename: displayName + '_' + hash,
            callStart: node.start,
            callEnd: node.end,
            calleeStart: node.name.start,
            calleeEnd: node.name.end,
            argStart: expr.start,
            argEnd: expr.end,
            bodyText,
            calleeName: attrName,
            isBare: false,
            isSync: false,
            qrlCallee: '',
            importSource: '',
            ctxKind,
            ctxName,
            origin: relPath,
            extension,
            loc: [line, col],
            parent: null,
            captures: false,
            captureNames: [],
            paramNames: [],
            segmentImports: collectSegmentImports(expr, imports),
            isInlinedQrl: false,
            explicitCaptures: null,
            inlinedQrlNameArg: null,
            isComponentEvent,
          });
        }
      }

      if (pushCount > 0) pushedNodes.set(node, pushCount);
    },

    leave(node: any) {
      const count = pushedNodes.get(node);
      if (count !== undefined) {
        for (let i = 0; i < count; i++) {
          ctx.pop();
        }
        pushedNodes.delete(node);
      }
    },
  });

  disambiguateExtractions(results, fileStem, relPath, scope);

  return results;
}

/**
 * Append _1, _2, etc. suffixes to extractions that share a display name,
 * recomputing hashes accordingly. Mirrors Rust's `register_context_name`.
 */
function disambiguateExtractions(
  extractions: ExtractionResult[],
  fileStem: string,
  relPath: string,
  scope?: string,
): void {
  const nameCounters = new Map<string, number>();
  const prefix = fileStem + '_';

  for (const ext of extractions) {
    const contextPortion = ext.displayName.startsWith(prefix)
      ? ext.displayName.slice(prefix.length)
      : ext.displayName;

    const existing = nameCounters.get(contextPortion);
    if (existing === undefined) {
      nameCounters.set(contextPortion, 0);
    } else {
      const newIndex = existing + 1;
      nameCounters.set(contextPortion, newIndex);

      const newContext = contextPortion + '_' + newIndex;
      const newHash = qwikHash(scope, relPath, newContext);
      ext.displayName = prefix + newContext;
      ext.hash = newHash;
      ext.symbolName = newContext + '_' + newHash;
      ext.canonicalFilename = ext.displayName + '_' + newHash;
    }
  }
}

/**
 * Core extraction engine for the Qwik optimizer.
 *
 * Walks an AST to find marker calls ($-suffixed functions), extracts segment
 * info (body text, positions, metadata), and returns an array of ExtractionResult
 * objects. Each result contains everything needed to generate a segment module
 * and rewrite the parent module.
 *
 * Implements: EXTRACT-02, EXTRACT-04, EXTRACT-07, IMP-05
 */

import { parseSync } from 'oxc-parser';
import { walk } from 'oxc-walker';
import { ContextStack } from './context-stack.js';
import {
  collectImports,
  collectCustomInlined,
  getCalleeName,
  isMarkerCall,
  isBare$,
  isSyncMarker,
  getCtxKind,
  getCtxName,
  type ImportInfo,
} from './marker-detection.js';
import { isEventProp, transformEventPropName } from './event-handler-transform.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

/**
 * Get the source file extension from a relative path.
 */
function getSourceExtension(relPath: string): string {
  const dotIdx = relPath.lastIndexOf('.');
  if (dotIdx >= 0) return relPath.slice(dotIdx);
  return '.js';
}

/**
 * Get the file stem (basename) from a relative path.
 * e.g., "src/components/test.tsx" -> "test.tsx"
 */
function getFileStem(relPath: string): string {
  const slashIdx = relPath.lastIndexOf('/');
  return slashIdx >= 0 ? relPath.slice(slashIdx + 1) : relPath;
}

/**
 * Compute the Qrl callee name from a marker callee name.
 * "$" -> "", "sync$" -> "_qrlSync", "component$" -> "componentQrl"
 */
function computeQrlCallee(calleeName: string): string {
  if (calleeName === '$') return '';
  if (calleeName === 'sync$') return '_qrlSync';
  return calleeName.slice(0, -1) + 'Qrl';
}

/**
 * Compute line and column from a character offset in source text.
 * Lines and columns are 1-based.
 */
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

/**
 * Collect all identifier names referenced in an AST subtree.
 * Used to determine which imports a segment body needs.
 */
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

// ---------------------------------------------------------------------------
// Main extraction function
// ---------------------------------------------------------------------------

/**
 * Extract all segments from a Qwik source file.
 *
 * Parses the source, walks the AST to find marker calls, and returns
 * an ExtractionResult for each one containing all info needed for
 * segment codegen and parent module rewriting.
 *
 * @param source - The source code text
 * @param relPath - Relative file path (e.g., "test.tsx")
 * @param scope - Optional scope prefix for hashing
 * @returns Array of ExtractionResult objects
 */
export function extractSegments(
  source: string,
  relPath: string,
  scope?: string,
): ExtractionResult[] {
  const { program } = parseSync(relPath, source);

  const imports = collectImports(program);
  const customInlined = collectCustomInlined(program);

  const fileStem = getFileStem(relPath);
  const sourceExt = getSourceExtension(relPath);
  const ctx = new ContextStack(fileStem, relPath, scope);

  const results: ExtractionResult[] = [];

  // Track which nodes we pushed context for, to pop on leave
  // Value is how many pushes were done for this node
  const pushedNodes = new Map<any, number>();

  // Track parent relationships for JSX attribute detection
  const parentMap = new Map<any, any>();

  walk(program, {
    enter(node: any, parent: any) {
      // Record parent relationship for later lookup
      if (parent) parentMap.set(node, parent);

      // --- Context stack pushes for naming ---
      let pushCount = 0;

      // VariableDeclarator with Identifier id
      if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier') {
        ctx.push(node.id.name);
        pushCount++;
      }

      // FunctionDeclaration with id
      if (node.type === 'FunctionDeclaration' && node.id) {
        ctx.push(node.id.name);
        pushCount++;
      }

      // Property key (object literal)
      if (node.type === 'Property' && node.key?.type === 'Identifier') {
        ctx.push(node.key.name);
        pushCount++;
      }

      // MethodDefinition key
      if (node.type === 'MethodDefinition' && node.key?.type === 'Identifier') {
        ctx.push(node.key.name);
        pushCount++;
      }

      // JSXOpeningElement: push tag name
      if (node.type === 'JSXOpeningElement') {
        const tagName =
          node.name?.type === 'JSXIdentifier'
            ? node.name.name
            : node.name?.type === 'JSXMemberExpression'
              ? node.name.property?.name ?? ''
              : '';
        if (tagName) {
          ctx.push(tagName);
          pushCount++;
        }
      }

      // JSXAttribute: push attribute name for naming context.
      // For event handler attrs like onClick$, push the transformed name
      // (e.g., "q_e_click") to match Rust optimizer naming.
      // For non-event attrs, push the raw name (e.g., "onClick" for onClick={$()}).
      if (node.type === 'JSXAttribute') {
        let rawAttrName: string | null = null;
        if (node.name?.type === 'JSXIdentifier') {
          rawAttrName = node.name.name;
        } else if (node.name?.type === 'JSXNamespacedName') {
          // e.g., host:onClick$ -> "host:onClick$"
          rawAttrName = `${node.name.namespace?.name ?? ''}:${node.name.name?.name ?? ''}`;
        }

        if (rawAttrName) {
          if (rawAttrName.endsWith('$') && isEventProp(rawAttrName)) {
            // Transform onClick$ -> q-e:click -> q_e_click for naming
            const transformed = transformEventPropName(rawAttrName, new Set());
            if (transformed) {
              ctx.push(transformed.replace(/[-:]/g, '_'));
            } else {
              ctx.push(rawAttrName);
            }
          } else if (rawAttrName.endsWith('$') && rawAttrName.startsWith('host:')) {
            // host: prefix events: push "host_" + stripped name for naming
            // e.g., host:onClick$ -> "host_onClick"
            const stripped = rawAttrName.slice(5, -1); // remove "host:" and "$"
            ctx.push('host_' + stripped);
          } else {
            ctx.push(rawAttrName);
          }
          pushCount++;
        }
      }

      // ExportDefaultDeclaration: push file stem if the declaration isn't a named function/class
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

      // --- Marker call detection ---
      // When entering a marker call, push the callee name onto context
      // so it's part of the display name (e.g., "component$" -> "component")
      if (node.type === 'CallExpression' && isMarkerCall(node, imports, customInlined)) {
        const calleeName = getCalleeName(node);
        if (!calleeName) {
          if (pushCount > 0) pushedNodes.set(node, pushCount);
          return;
        }

        // Resolve the canonical (imported) name for aliased imports
        // e.g., `import { component$ as c$ }` → calleeName is "c$" but canonical is "component$"
        const importInfo = imports.get(calleeName);
        const canonicalCallee = importInfo ? importInfo.importedName : calleeName;

        // Push callee name for naming context
        ctx.push(canonicalCallee);
        pushCount++;

        const arg = node.arguments?.[0];
        if (!arg) {
          if (pushCount > 0) pushedNodes.set(node, pushCount);
          return;
        }

        const bodyText = source.slice(arg.start, arg.end);
        const isBare = canonicalCallee === '$';
        const isSync = isSyncMarker(canonicalCallee);
        const qrlCallee = computeQrlCallee(canonicalCallee);

        // Check if this $() call is inside a JSX attribute value.
        // Walk up the parent chain to find a JSXAttribute ancestor.
        // We use parentMap (built during walk) to check.
        let isEventAttr = false;
        let isJsxNonEventAttr = false;
        let attrCtx: string | undefined;

        // Check immediate parent chain: CallExpression -> JSXExpressionContainer -> JSXAttribute
        if (parent?.type === 'JSXExpressionContainer') {
          // The parent of JSXExpressionContainer should be a JSXAttribute
          const jsxAttrParent = parentMap.get(parent);
          if (jsxAttrParent?.type === 'JSXAttribute') {
            let jsxAttrName: string | null = null;
            if (jsxAttrParent.name?.type === 'JSXIdentifier') {
              jsxAttrName = jsxAttrParent.name.name;
            } else if (jsxAttrParent.name?.type === 'JSXNamespacedName') {
              jsxAttrName = `${jsxAttrParent.name.namespace?.name ?? ''}:${jsxAttrParent.name.name?.name ?? ''}`;
            }
            if (jsxAttrName?.endsWith('$')) {
              // Use context stack to get the attr name (already transformed)
              const ctxStack = ctx.getContextStack();
              attrCtx = ctxStack.length >= 2 ? ctxStack[ctxStack.length - 2] : jsxAttrName;
              isEventAttr = jsxAttrName.startsWith('on') || jsxAttrName.startsWith('document:on') || jsxAttrName.startsWith('window:on');
              isJsxNonEventAttr = !isEventAttr;
            }
          }
        }

        const ctxKind = getCtxKind(canonicalCallee, isEventAttr, isJsxNonEventAttr);
        const ctxName = getCtxName(canonicalCallee, isEventAttr, isEventAttr ? attrCtx : undefined);

        const displayName = ctx.getDisplayName();
        const symbolName = ctx.getSymbolName();

        // Extract hash from symbolName (last segment after final underscore)
        const lastUnder = symbolName.lastIndexOf('_');
        const hash = lastUnder >= 0 ? symbolName.slice(lastUnder + 1) : symbolName;

        const extension = determineExtension(arg, sourceExt);
        const [line, col] = computeLineCol(source, arg.start);

        // Determine which imports the segment body references
        const bodyIds = collectIdentifiers(arg);
        const segmentImports: ImportInfo[] = [];
        for (const [localName, info] of imports) {
          if (bodyIds.has(localName)) {
            segmentImports.push(info);
          }
        }

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
          ctxKind,
          ctxName,
          origin: relPath,
          extension,
          loc: [line, col],
          parent: null, // Plan 04 handles nesting
          captures: false, // Phase 3: populated by transform.ts
          captureNames: [], // Phase 3: populated by transform.ts
          paramNames: [], // Phase 3: populated by transform.ts
          segmentImports,
        });
      }

      // --- JSX $-suffixed attribute extraction ---
      // When we see onClick$={expr}, extract expr as a segment.
      // The attribute name (e.g., onClick$) determines the ctxName/ctxKind.
      // The value (inside JSXExpressionContainer) is the segment body.
      // Determine $-suffixed JSX attribute name for extraction
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
      if (jsxAttrName !== null) {
        const attrName = jsxAttrName;
        const expr = node.value.expression;

        // Skip if expression is itself a $() call -- that's handled by marker call detection
        if (expr.type === 'CallExpression' && isMarkerCall(expr, imports, customInlined)) {
          // Already handled by marker call detection above
        } else if (
          expr.type === 'ArrowFunctionExpression' ||
          expr.type === 'FunctionExpression'
        ) {
          // This is a direct function expression in a $-suffixed JSX prop:
          // onClick$={() => ...} or onInput$={function() {...}}
          // Extract it as a segment.

          // Push the attribute name to name context (already done above for JSXAttribute)
          // The attrName is already in the context stack from the JSXAttribute push above.

          const bodyText = source.slice(expr.start, expr.end);

          // All $-suffixed JSX attribute extractions are treated as eventHandler
          // by the Rust optimizer, regardless of whether they start with "on".
          const ctxKind: 'function' | 'eventHandler' | 'jSXProp' = 'eventHandler';
          const ctxName = attrName; // e.g., onClick$, custom$, onInput$

          const displayName = ctx.getDisplayName();
          const symbolName = ctx.getSymbolName();

          const lastUnder = symbolName.lastIndexOf('_');
          const hash = lastUnder >= 0 ? symbolName.slice(lastUnder + 1) : symbolName;

          const extension = determineExtension(expr, sourceExt);
          const [line, col] = computeLineCol(source, expr.start);

          const bodyIds = collectIdentifiers(expr);
          const segImports: ImportInfo[] = [];
          for (const [localName, info] of imports) {
            if (bodyIds.has(localName)) {
              segImports.push(info);
            }
          }

          results.push({
            symbolName,
            displayName,
            hash,
            canonicalFilename: displayName + '_' + hash,
            callStart: node.start, // The JSXAttribute node
            callEnd: node.end,
            calleeStart: node.name.start,
            calleeEnd: node.name.end,
            argStart: expr.start,
            argEnd: expr.end,
            bodyText,
            calleeName: attrName,
            isBare: false,
            isSync: false,
            qrlCallee: '', // JSX event attrs use qrl() directly
            ctxKind,
            ctxName,
            origin: relPath,
            extension,
            loc: [line, col],
            parent: null,
            captures: false,
            captureNames: [],
            paramNames: [],
            segmentImports: segImports,
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

  return results;
}

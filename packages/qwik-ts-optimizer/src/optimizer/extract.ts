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
import { qwikHash } from '../hashing/siphash.js';
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
  type CustomInlinedInfo,
  type ImportInfo,
} from './marker-detection.js';
import { isEventProp, transformEventPropName, collectPassiveDirectives } from './event-handler-transform.js';

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
 *
 * When the filename is "index.*", derives the stem from the parent directory
 * name to match Rust optimizer behavior. For example:
 * "src/components/mongo/index.tsx" -> "mongo" (not "index.tsx")
 *
 * Returns { stem, isIndex } where isIndex indicates the filename was index.*
 * (used to skip default export push since directory name already serves as prefix).
 */
function getFileStem(relPath: string): { stem: string; isIndex: boolean } {
  const slashIdx = relPath.lastIndexOf('/');
  const basename = slashIdx >= 0 ? relPath.slice(slashIdx + 1) : relPath;

  // Check if the filename is "index.*"
  const dotIdx = basename.lastIndexOf('.');
  const nameWithoutExt = dotIdx >= 0 ? basename.slice(0, dotIdx) : basename;

  if (nameWithoutExt === 'index' && slashIdx >= 0) {
    // Use parent directory name instead (without extension)
    const dirPath = relPath.slice(0, slashIdx);
    const parentSlashIdx = dirPath.lastIndexOf('/');
    const dirName = parentSlashIdx >= 0 ? dirPath.slice(parentSlashIdx + 1) : dirPath;
    return { stem: dirName, isIndex: true };
  }

  return { stem: basename, isIndex: false };
}

/**
 * Resolve the canonical (imported) name for an identifier callee.
 * e.g., `import { component$ as c$ }` -> "component$"
 */
function resolveCanonicalCalleeName(
  calleeName: string,
  imports: Map<string, ImportInfo>,
): string {
  const importInfo = imports.get(calleeName);
  return importInfo ? importInfo.importedName : calleeName;
}

/**
 * Bare $() segments inherit the direct wrapper call name as naming context.
 * Examples:
 * - component($(() => {})) -> "..._component"
 * - useStyles($('thing')) -> "..._useStyles"
 * - componentQrl($(() => {})) -> "..._componentQrl"
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
  transpileJsx?: boolean,
): ExtractionResult[] {
  const { program } = parseSync(relPath, source, { experimentalRawTransfer: true } as any);

  const imports = collectImports(program);
  const customInlined = collectCustomInlined(program);

  const { stem: fileStem, isIndex: isIndexFile } = getFileStem(relPath);
  const sourceExt = getSourceExtension(relPath);
  const ctx = new ContextStack(fileStem, relPath, scope);

  const results: ExtractionResult[] = [];

  // Track which nodes we pushed context for, to pop on leave
  // Value is how many pushes were done for this node
  const pushedNodes = new Map<any, number>();

  // Track parent relationships for JSX attribute detection
  const parentMap = new Map<any, any>();

  // Track marker call depth for JSX extraction scoping.
  // JSX $-suffixed attributes are only extracted when inside a marker call scope.
  let markerCallDepth = 0;
  const markerCallNodes = new Set<any>();

  // Detect @jsxImportSource pragma. When set to a non-Qwik package (e.g., "react"),
  // JSX $-suffixed attribute extraction is suppressed entirely because the JSX
  // uses a foreign runtime that doesn't understand Qwik's event handler extraction.
  const hasNonQwikJsxImportSource = /\/\*\s*@jsxImportSource\s+(?!@qwik|@builder\.io\/qwik)\S+/.test(source);

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

      // Custom $-suffixed calls (e.g., useMemo$()): push callee name to context stack
      // for display name generation. This is ONLY for naming -- it does NOT trigger extraction.
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

      // JSXFragment (<>...</>): push "Fragment" onto context stack ONLY when
      // transpileJsx is true. In Rust SWC, when transpileJsx is enabled, the
      // jsx plugin converts <> to jsx(Fragment, ...) BEFORE the optimizer fold.
      // The optimizer's handle_jsx then pushes "Fragment" (as an Ident) to
      // stack_ctxt. When transpileJsx is false, JSXFragment has no fold_jsx_fragment
      // handler, so nothing is pushed.
      if (node.type === 'JSXFragment' && transpileJsx) {
        ctx.push('Fragment');
        pushCount++;
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
            // For HTML elements (lowercase tag), transform onClick$ -> q-e:click -> q_e_click.
            // For component elements (uppercase tag), keep original name without $ suffix
            // (e.g., onClick$ -> onClick). This matches Rust optimizer naming.
            const parentTag = parent?.type === 'JSXOpeningElement'
              ? (parent.name?.type === 'JSXIdentifier' ? parent.name.name : '')
              : '';
            const isComponentElement = parentTag.length > 0 && parentTag[0] === parentTag[0].toUpperCase() && parentTag[0] !== parentTag[0].toLowerCase();
            if (isComponentElement) {
              // Component element: push raw name without $ suffix
              ctx.push(rawAttrName.slice(0, -1)); // "onClick$" -> "onClick"
            } else {
              // HTML element: transform to q-e:event_name format
              // Collect passive directives from sibling attributes on the same element
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
        if (!hasName && !isIndexFile) {
          // For index files, the fileStem is already the directory name
          // which serves as the display name prefix -- no extra push needed
          ctx.pushDefaultExport();
          pushCount++;
        }
      }

      // --- inlinedQrl detection ---
      // inlinedQrl(body, nameString, [captures]) is a pre-processed QRL call.
      // Detect it BEFORE regular marker detection since inlinedQrl is NOT a $-suffixed marker.
      if (
        node.type === 'CallExpression' &&
        node.callee?.type === 'Identifier' &&
        (node.callee.name === 'inlinedQrl' || node.callee.name === '_inlinedQrl') &&
        imports.get(node.callee.name)?.isQwikCore &&
        node.arguments?.length >= 2
      ) {
        const calleeName = node.callee.name;
        const arg0 = node.arguments[0]; // body (function/arrow)
        const arg1 = node.arguments[1]; // symbol name (string literal)
        const arg2 = node.arguments[2]; // captures array (optional)

        // arg1 must be a string literal
        const nameValue = arg1?.type === 'StringLiteral'
          ? arg1.value
          : (arg1?.type === 'Literal' && typeof arg1.value === 'string')
            ? arg1.value
            : null;

        // Skip extraction when the body is null — inlinedQrl(null, ...) is a no-op passthrough
        const isNullBody = arg0 && (
          arg0.type === 'NullLiteral' ||
          (arg0.type === 'Literal' && arg0.value === null)
        );

        if (arg0 && nameValue && !isNullBody) {
          const bodyText = source.slice(arg0.start, arg0.end);

          // Parse symbol name: split into displayName part and hash part
          // "task" -> symbolName="task", hash="task", displayName="fileStem_task"
          // "qwikifyQrl_component_zH94hIe0Ick" -> hash="zH94hIe0Ick", displayName="fileStem_qwikifyQrl_component"
          const lastUnder = nameValue.lastIndexOf('_');
          let inlinedHash: string;
          let displayNameSuffix: string;
          if (lastUnder > 0) {
            const lastPart = nameValue.slice(lastUnder + 1);
            // Heuristic: if last segment is alphanumeric and >= 8 chars, treat as hash
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

          // Parse captures from arg2 (array expression)
          let explicitCapturesText: string | null = null;
          const inlinedCaptureNames: string[] = [];
          if (arg2 && (arg2.type === 'ArrayExpression' || arg2.type === 'ArrayPattern')) {
            explicitCapturesText = source.slice(arg2.start, arg2.end);
            // Extract identifier names, filter non-identifiers (true, false, numbers, strings)
            for (const elem of arg2.elements ?? []) {
              if (elem?.type === 'Identifier') {
                inlinedCaptureNames.push(elem.name);
              }
              // Non-identifier elements (true, false, numbers, strings) are filtered out
            }
          }

          // Determine ctxName: for inlinedQrl, check parent call expression
          // e.g., componentQrl(inlinedQrl(...)) -> ctxName = "component$"
          // e.g., useTaskQrl(inlinedQrl(...)) -> ctxName = "useTask$"
          // If no parent wrapper, use the symbol name (e.g., "task")
          let inlinedCtxName = nameValue;
          if (parent?.type === 'CallExpression') {
            const parentCallee = getCalleeName(parent);
            if (parentCallee) {
              // Resolve canonical name
              const canonicalParentCallee = resolveCanonicalCalleeName(parentCallee, imports);
              // Convert Qrl suffix back to $ for ctxName
              if (canonicalParentCallee.endsWith('Qrl')) {
                inlinedCtxName = canonicalParentCallee.slice(0, -3) + '$';
              } else {
                inlinedCtxName = canonicalParentCallee;
              }
            }
          }

          // For inlinedQrl, use source file extension (not body-based detection)
          const extension = sourceExt;
          const [line, col] = computeLineCol(source, arg0.start);

          // Collect imports referenced in segment body
          const bodyIds = collectIdentifiers(arg0);
          const segImports: ImportInfo[] = [];
          for (const [localName, info] of imports) {
            if (bodyIds.has(localName)) {
              segImports.push(info);
            }
          }

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
            segmentImports: segImports,
            isInlinedQrl: true,
            explicitCaptures: explicitCapturesText,
            inlinedQrlNameArg: nameValue,
            isComponentEvent: false,
          });
        }

        if (pushCount > 0) pushedNodes.set(node, pushCount);
        return;
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
        const canonicalCallee = resolveCanonicalCalleeName(calleeName, imports);

        // Bare $() segments inherit the immediate wrapper call name for hashing.
        // This matches Rust naming for cases like component($(...)) and useStyles($(...)).
        const wrapperContext = canonicalCallee === '$'
          ? getDirectWrapperContextName(node, parent, imports, customInlined)
          : null;
        if (wrapperContext) {
          ctx.push(wrapperContext);
          pushCount++;
        }

        // Push the *local* callee name for naming context.
        // SWC uses the local alias name (e.g., "Component" for `component$ as Component`),
        // not the canonical/imported name (e.g., "component$").
        ctx.push(calleeName);
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
              // The stack top is the current marker call; the previous entry is the JSX attr.
              attrCtx = ctx.peek(1) ?? jsxAttrName;

              // SWC: component elements (is_fn=true) use SegmentKind::JSXProp for ALL $-suffixed attrs,
              // including onClick$. Only HTML elements use SegmentKind::EventHandler.
              // Check if the enclosing JSX element is a component (tag starts with uppercase).
              const jsxOpeningElement = parentMap.get(jsxAttrParent);
              let isComponentElement = false;
              if (jsxOpeningElement?.type === 'JSXOpeningElement') {
                const tagName = jsxOpeningElement.name;
                if (tagName?.type === 'JSXIdentifier') {
                  // Component if first char is uppercase
                  isComponentElement = tagName.name[0] === tagName.name[0].toUpperCase();
                } else if (tagName?.type === 'JSXMemberExpression') {
                  isComponentElement = true; // member expressions like Foo.Bar are always components
                }
              }

              if (isComponentElement) {
                // All $-suffixed props on components are jSXProp (SWC behavior)
                isEventAttr = false;
                isJsxNonEventAttr = true;
              } else {
                // HTML elements: on* -> eventHandler, others -> jSXProp
                isEventAttr = jsxAttrName.startsWith('on') || jsxAttrName.startsWith('document:on') || jsxAttrName.startsWith('window:on');
                isJsxNonEventAttr = !isEventAttr;
              }
            }
          }
        }

        const ctxKind = getCtxKind(canonicalCallee, isEventAttr, isJsxNonEventAttr);
        // For both eventHandler and jSXProp, use the attribute name as ctxName
        const isJsxAttrContext = isEventAttr || isJsxNonEventAttr;
        const ctxName = getCtxName(canonicalCallee, isJsxAttrContext, isJsxAttrContext ? attrCtx : undefined);

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
          importSource: imports.get(calleeName)?.source ?? '',
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
          isInlinedQrl: false,
          explicitCaptures: null,
          inlinedQrlNameArg: null,
          isComponentEvent: false,
        });
      }

      // Track marker call depth for JSX extraction scoping
      if (node.type === 'CallExpression' && isMarkerCall(node, imports, customInlined)) {
        markerCallDepth++;
        markerCallNodes.add(node);
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
      if (jsxAttrName !== null && !hasNonQwikJsxImportSource) {
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

          // Detect if this event handler is on a component element (uppercase tag)
          const parentOpeningTag = parent?.type === 'JSXOpeningElement'
            ? (parent.name?.type === 'JSXIdentifier' ? parent.name.name : '')
            : '';
          const isComponentEvent = parentOpeningTag.length > 0 &&
            parentOpeningTag[0] === parentOpeningTag[0].toUpperCase() &&
            parentOpeningTag[0] !== parentOpeningTag[0].toLowerCase();

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
            segmentImports: segImports,
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
      // Decrement marker call depth when leaving a marker call
      if (markerCallNodes.has(node)) {
        markerCallDepth--;
        markerCallNodes.delete(node);
      }

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

// ---------------------------------------------------------------------------
// Disambiguation
// ---------------------------------------------------------------------------

/**
 * Disambiguate extractions that share the same display name by appending
 * _1, _2, etc. suffixes. The first occurrence keeps its original name
 * (index 0), subsequent duplicates get _1, _2, etc.
 *
 * This matches Rust optimizer's `register_context_name` behavior.
 * After appending the suffix, the hash is recomputed since the hash input
 * includes the context portion.
 *
 * Must be called BEFORE parent module rewriting so QRL declarations
 * reference the disambiguated names.
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
    // Extract context portion from displayName
    const contextPortion = ext.displayName.startsWith(prefix)
      ? ext.displayName.slice(prefix.length)
      : ext.displayName;

    const existing = nameCounters.get(contextPortion);
    if (existing === undefined) {
      // First occurrence: index 0, no suffix
      nameCounters.set(contextPortion, 0);
    } else {
      // Duplicate: increment counter, append suffix
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

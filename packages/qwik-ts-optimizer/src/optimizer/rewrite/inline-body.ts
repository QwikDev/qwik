/**
 * Inline .s() body transformation for extracted segments.
 *
 * Rewrites nested call sites, inlines const literals, applies _rawProps
 * transformation, runs JSX transpilation, and eliminates dead const
 * declarations within extraction body text.
 */

import MagicString from 'magic-string';
import { parseSync } from 'oxc-parser';
import { RAW_TRANSFER_PARSER_OPTIONS } from '../../ast-types.js';
import type { ExtractionResult } from '../extract.js';
import { transformEventPropName } from '../transform/event-handlers.js';
import { transformAllJsx } from '../transform/jsx.js';
import { SignalHoister } from '../signal-analysis.js';
import { getQrlImportSource } from '../rewrite-calls.js';
import { injectCapturesUnpacking, removeDeadConstLiterals } from '../segment-codegen.js';
import {
  resolveConstLiterals,
  inlineConstCaptures,
  propagateConstLiteralsInBody,
} from './const-propagation.js';
import {
  applyRawPropsTransform,
  consolidateRawPropsInWCalls,
  replacePropsFieldReferencesInBody,
  type SCallBodyJsxOptions,
} from './raw-props.js';

// ── JSX q:p override helpers ──

/** Extract the attribute name from a JSX attribute node. */
function getJsxAttrName(attr: any): string | null {
  if (attr.name?.type === 'JSXIdentifier') return attr.name.name;
  if (attr.name?.type === 'JSXNamespacedName') {
    return `${attr.name.namespace?.name}:${attr.name.name?.name}`;
  }
  return null;
}

/** Check whether a JSX attribute name represents an event/QRL handler. */
function isEventAttribute(name: string): boolean {
  return name.endsWith('$') ||
    name.startsWith('q-e:') || name.startsWith('q-ep:') ||
    name.startsWith('q-dp:') || name.startsWith('q-wp:') ||
    name.startsWith('q-d:') || name.startsWith('q-w:');
}

/**
 * Collect promoted capture params from a JSX element's event handler attributes,
 * adding matched QRL names to `qrlsWithCaptures`.
 */
function collectQpParamsFromElement(
  attrs: any[],
  qrlParamMap: Map<string, string[]>,
  qrlsWithCaptures: Set<string>,
): string[] {
  const elementParams: string[] = [];
  const seen = new Set<string>();

  for (const attr of attrs) {
    if (attr.type !== 'JSXAttribute') continue;

    const attrName = getJsxAttrName(attr);
    if (!attrName || !isEventAttribute(attrName)) continue;
    if (attr.value?.type !== 'JSXExpressionContainer') continue;
    if (attr.value.expression?.type !== 'Identifier') continue;

    const qrlName = attr.value.expression.name;
    const params = qrlParamMap.get(qrlName);
    if (!params) continue;

    qrlsWithCaptures.add(qrlName);
    for (const p of params) {
      if (!seen.has(p)) { seen.add(p); elementParams.push(p); }
    }
  }

  return elementParams;
}

/**
 * Recursively walk an AST to find JSX elements with event handler attributes
 * that reference QRLs with promoted captures, populating qpOverrides.
 */
function walkAstForQp(
  node: any,
  qrlParamMap: Map<string, string[]>,
  qpOverrides: Map<number, string[]>,
  qrlsWithCaptures: Set<string>,
): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) walkAstForQp(child, qrlParamMap, qpOverrides, qrlsWithCaptures);
    return;
  }

  if (node.type === 'JSXElement' && node.openingElement) {
    const attrs = node.openingElement.attributes || [];
    const elementParams = collectQpParamsFromElement(attrs, qrlParamMap, qrlsWithCaptures);
    if (elementParams.length > 0) {
      qpOverrides.set(node.start, elementParams);
    }
  }

  for (const key of Object.keys(node)) {
    if (key === 'start' || key === 'end' || key === 'loc' || key === 'range') continue;
    walkAstForQp(node[key], qrlParamMap, qpOverrides, qrlsWithCaptures);
  }
}

/** Extraction's callee name (e.g. "server$") matches regCtxName "server" + "$". */
function matchesRegCtxName(ext: ExtractionResult, regCtxName?: string[]): boolean {
  if (!regCtxName || regCtxName.length === 0) return false;
  for (const name of regCtxName) {
    if (ext.calleeName === name + '$') return true;
  }
  return false;
}

export function transformSCallBody(
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
        } else if ((child.ctxKind === 'eventHandler' || child.ctxKind === 'jSXProp') && !child.qrlCallee) {
          // Direct JSX event/QRL-prop attribute: onClick$={() => ...) -> q-e:click={q_varName}
          // Also handles jSXProp (render$, custom$, etc.) which behave identically
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
            // Preserve the original import source package for serverQrl
            // (e.g., server$ from @qwik.dev/router should emit serverQrl from @qwik.dev/router)
            const serverQrlSource = child.importSource || '@qwik.dev/core';
            additionalImports.set('serverQrl', serverQrlSource);
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

  // 3. Inline pre-resolved const literals into the body text.
  //    These were resolved early in transform.ts (before event handler promotion)
  //    and stored on the extraction. Apply them to the body text here.
  if (ext.constLiterals && ext.constLiterals.size > 0) {
    body = inlineConstCaptures(body, ext.constLiterals);
  }

  // 3a. Resolve const literals from parent for any remaining captures.
  //     This handles non-event-handler extractions that weren't processed by early resolution.
  const isRegCtx = matchesRegCtxName(ext, regCtxName);
  if (ext.captureNames.length > 0 && ext.parent !== null) {
    const parentExt = allExtractions.find(e => e.symbolName === ext.parent);
    if (parentExt) {
      const constValues = resolveConstLiterals(parentExt.bodyText, ext.captureNames);
      if (constValues.size > 0) {
        body = inlineConstCaptures(body, constValues);
        // Remove inlined names from captureNames
        ext.captureNames = ext.captureNames.filter(n => !constValues.has(n));
        ext.captures = ext.captureNames.length > 0;
        // Store for later use (e.g., parent DCE)
        if (!ext.constLiterals) ext.constLiterals = constValues;
        else for (const [k, v] of constValues) ext.constLiterals.set(k, v);
      }
    }
  }

  // 3b. Inject _captures unpacking if this extraction has remaining captures.
  //     For regCtxName-matched extractions, don't inject _captures (they don't use it).
  if (isRegCtx) {
    // Don't inject _captures for regCtxName extractions
  } else if (ext.captureNames.length > 0) {
    body = injectCapturesUnpacking(body, ext.captureNames);
    additionalImports.set('_captures', '@qwik.dev/core');
  }
  // 3b. _rawProps destructuring optimization for component$ extractions ONLY.
  //     When a component has destructured params like ({field1, field2}),
  //     rewrite to (_rawProps) and replace field refs with _rawProps.field.
  //     Other closures (useTask$, useVisibleTask$, $, etc.) keep their original
  //     destructuring patterns intact (e.g., ({ track }) stays as-is).
  const isComponentCtx = ext.ctxName === 'component$' || ext.ctxName === 'componentQrl';
  {
    const rawPropsResult = isComponentCtx ? applyRawPropsTransform(body) : body;
    if (rawPropsResult !== body) {
      body = rawPropsResult;
      // If _restProps was introduced, ensure its import is tracked
      if (body.includes('_restProps(')) {
        additionalImports.set('_restProps', '@qwik.dev/core');
      }
      // Consolidate .w([_rawProps.foo, _rawProps.bar]) -> .w([_rawProps])
      body = consolidateRawPropsInWCalls(body);
    }
  }

  // 3c. For child segments whose captures were consolidated into _rawProps,
  //     replace original field name references with _rawProps.field in the body.
  //     This handles the case where useComputed$(() => color) inside component$({color})
  //     needs to become useComputed$(() => _rawProps.color).
  if (ext.propsFieldCaptures && ext.propsFieldCaptures.size > 0) {
    body = replacePropsFieldReferencesInBody(body, ext.propsFieldCaptures);
  }

  // 3d. Intra-body const literal propagation.
  //     Inline `const X = <literal>` within the body and remove dead declarations.
  //     Only handles literal consts (string, number, boolean, null) for safety.
  body = propagateConstLiteralsInBody(body);

  // 4. JSX transpilation within the body text
  let finalKeyCounterValue: number | undefined;
  if (jsxBodyOptions?.enableJsx) {
    // Wrap the body as a parseable module-level expression
    const wrapperPrefix = 'const __body__ = ';
    const wrappedSource = wrapperPrefix + body;

    // Parse the wrapped source to get an AST
    const parseResult = parseSync('__body__.tsx', wrappedSource, RAW_TRANSFER_PARSER_OPTIONS);
    if (parseResult.program && !parseResult.errors?.length) {
      const bodyS = new MagicString(wrappedSource);

      // Augment importedNames with QRL variable names so they're classified as
      // const in prop classification (they're module-level const declarations)
      const bodyImportedNames = new Set(jsxBodyOptions.importedNames);
      for (const [, varName] of qrlVarNames) {
        bodyImportedNames.add(varName);
      }

      // Build qpOverrides and qrlsWithCaptures from nested event handler extractions
      // that have promoted captures (paramNames with _, _1 padding).
      // This enables q:p/q:ps injection on JSX elements with event handler QRLs.
      let bodyQpOverrides: Map<number, string[]> | undefined;
      let bodyQrlsWithCaptures: Set<string> | undefined;
      {
        // Build a map from QRL variable name -> promoted capture param names
        const qrlParamMap = new Map<string, string[]>();
        for (const child of nested) {
          if (child.ctxKind !== 'eventHandler') continue;
          if (child.paramNames.length < 2 || child.paramNames[0] !== '_' || child.paramNames[1] !== '_1') continue;
          // Extract actual capture params (skip _, _1 padding and _N gap placeholders)
          const captureParams: string[] = [];
          for (let pi = 2; pi < child.paramNames.length; pi++) {
            const p = child.paramNames[pi];
            if (/^_\d+$/.test(p) || p === '_') continue;
            captureParams.push(p);
          }
          if (captureParams.length === 0) continue;
          const childVarName = qrlVarNames.get(child.symbolName) ?? `q_${child.symbolName}`;
          qrlParamMap.set(childVarName, captureParams);
          // Also map the symbol name itself (used when .w() hoisting creates a const)
          qrlParamMap.set(child.symbolName, captureParams);
        }

        if (qrlParamMap.size > 0) {
          bodyQpOverrides = new Map();
          bodyQrlsWithCaptures = new Set();
          walkAstForQp(parseResult.program, qrlParamMap, bodyQpOverrides, bodyQrlsWithCaptures);
          // If no overrides were found, clear the maps
          if (bodyQpOverrides.size === 0) {
            bodyQpOverrides = undefined;
            bodyQrlsWithCaptures = undefined;
          }
        }
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
        bodyQpOverrides, // qpOverrides for q:p/q:ps injection
        bodyQrlsWithCaptures, // qrlsWithCaptures for var/const prop classification
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

  // Dead const literal elimination: remove `const X = literal;` declarations
  // from the body when X is no longer referenced (after nested extractions
  // consumed those const captures and they were inlined into child segments).
  const hasNestedExts = allExtractions.some(e => e.parent === ext.symbolName);
  if (hasNestedExts) {
    body = removeDeadConstLiterals(body);
  }

  return { transformedBody: body, additionalImports, hoistedDeclarations, keyCounterValue: finalKeyCounterValue };
}

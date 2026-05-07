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
  type InlineSegmentJsxOptions,
} from './raw-props.js';
import {
  hasUnderscorePlaceholderParams,
  isEventHandlerOrJsxProp,
  matchesRegCtxName,
} from './predicates.js';

function getJsxAttrName(attr: any): string | null {
  if (attr.name?.type === 'JSXIdentifier') return attr.name.name;
  if (attr.name?.type === 'JSXNamespacedName') {
    return `${attr.name.namespace?.name}:${attr.name.name?.name}`;
  }
  return null;
}

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

/**
 * Transform an inline segment body through nine sequential phases:
 * nested-call rewriting, own const-literal inlining, parent const-literal
 * inlining, capture unpacking, _rawProps, props-field captures, body const
 * propagation, JSX, and dead-const removal.
 *
 * `additionalImports` is collected incrementally as transforms run —
 * each phase decides what symbols it needs and adds them to the map.
 * This is intentional: deriving the imports centrally would require
 * each phase to either expose its decisions or duplicate the
 * detection logic, both of which add coupling. The incremental form
 * keeps each phase self-contained, at the cost of imports being set
 * across multiple call sites in this function.
 */
export function transformInlineSegmentBody(
  ext: ExtractionResult,
  allExtractions: ExtractionResult[],
  qrlVarNames: Map<string, string>,
  jsxBodyOptions?: InlineSegmentJsxOptions,
  regCtxName?: string[],
  sharedSignalHoister?: SignalHoister,
): { transformedBody: string; additionalImports: Map<string, string>; hoistedDeclarations: string[]; keyCounterValue?: number } {
  let body = ext.bodyText;
  const additionalImports = new Map<string, string>();
  const hoistedDeclarations: string[] = [];

  const nested = allExtractions.filter(e => e.parent === ext.symbolName);

  if (nested.length > 0) {
    const bodyOffset = ext.argStart;
    const sortedNested = [...nested].sort((a, b) => b.callStart - a.callStart);

    for (const child of sortedNested) {
      const childVarName = qrlVarNames.get(child.symbolName) ?? `q_${child.symbolName}`;

      const relCallStart = child.callStart - bodyOffset;
      const relCallEnd = child.callEnd - bodyOffset;

      if (relCallStart >= 0 && relCallEnd <= body.length) {
        if (child.isBare) {
          body = body.slice(0, relCallStart) + childVarName + body.slice(relCallEnd);
        } else if (isEventHandlerOrJsxProp(child.ctxKind) && !child.qrlCallee) {
          let propName: string;
          if (child.isComponentEvent) {
            propName = child.ctxName;
          } else {
            const transformedPropName = transformEventPropName(child.ctxName, new Set());
            propName = transformedPropName ?? child.ctxName;
          }

          // For regCtxName-matched extractions, wrap the QRL var in serverQrl()
          const isRegCtx = matchesRegCtxName(child, regCtxName);
          let qrlRef = isRegCtx ? `serverQrl(${childVarName})` : childVarName;
          if (isRegCtx) {
            const serverQrlSource = child.importSource || '@qwik.dev/core';
            additionalImports.set('serverQrl', serverQrlSource);
          }

          const hasLoopCrossCaptures = !isRegCtx &&
            child.captures &&
            child.captureNames.length > 0 &&
            hasUnderscorePlaceholderParams(child.paramNames);

          if (hasLoopCrossCaptures) {
            const hoistedName = child.symbolName;
            const wCaptures = child.captureNames.join(',\n            ');
            const hoistDecl = `const ${hoistedName} = ${childVarName}.w([\n            ${wCaptures}\n        ]);`;
            hoistedDeclarations.push(hoistDecl);
            qrlRef = hoistedName;
          } else if (!isRegCtx && child.captureNames.length > 0) {
            qrlRef += '.w([\n        ' + child.captureNames.join(',\n        ') + '\n    ])';
          }

          const replacement = `${propName}={${qrlRef}}`;
          body = body.slice(0, relCallStart) + replacement + body.slice(relCallEnd);
        } else {
          let replacement = child.qrlCallee + '(' + childVarName;

          if (child.captureNames.length > 0) {
            replacement += '.w([\n        ' + child.captureNames.join(',\n        ') + '\n    ])';
          }

          replacement += ')';
          body = body.slice(0, relCallStart) + replacement + body.slice(relCallEnd);

          if (child.qrlCallee) {
            additionalImports.set(child.qrlCallee, getQrlImportSource(child.qrlCallee, child.importSource));
          }
        }
      }
    }
  }

  if (ext.constLiterals && ext.constLiterals.size > 0) {
    body = inlineConstCaptures(body, ext.constLiterals);
  }

  const isRegCtx = matchesRegCtxName(ext, regCtxName);
  if (ext.captureNames.length > 0 && ext.parent !== null) {
    const parentExt = allExtractions.find(e => e.symbolName === ext.parent);
    if (parentExt) {
      const constValues = resolveConstLiterals(parentExt.bodyText, ext.captureNames);
      if (constValues.size > 0) {
        body = inlineConstCaptures(body, constValues);
        ext.captureNames = ext.captureNames.filter(n => !constValues.has(n));
        ext.captures = ext.captureNames.length > 0;
        if (!ext.constLiterals) ext.constLiterals = constValues;
        else for (const [k, v] of constValues) ext.constLiterals.set(k, v);
      }
    }
  }

  if (isRegCtx) {
    // regCtxName extractions don't use _captures
  } else if (ext.captureNames.length > 0) {
    body = injectCapturesUnpacking(body, ext.captureNames);
    additionalImports.set('_captures', '@qwik.dev/core');
  }
  // _rawProps transform only applies to component$ extractions
  const isComponentCtx = ext.ctxName === 'component$' || ext.ctxName === 'componentQrl';
  {
    const rawPropsResult = isComponentCtx ? applyRawPropsTransform(body) : body;
    if (rawPropsResult !== body) {
      body = rawPropsResult;
      if (body.includes('_restProps(')) {
        additionalImports.set('_restProps', '@qwik.dev/core');
      }
      body = consolidateRawPropsInWCalls(body);
    }
  }

  if (ext.propsFieldCaptures && ext.propsFieldCaptures.size > 0) {
    body = replacePropsFieldReferencesInBody(body, ext.propsFieldCaptures);
  }

  body = propagateConstLiteralsInBody(body);

  let finalKeyCounterValue: number | undefined;
  if (jsxBodyOptions?.enableJsx) {
    const wrapperPrefix = 'const __body__ = ';
    const wrappedSource = wrapperPrefix + body;

    const parseResult = parseSync('__body__.tsx', wrappedSource, RAW_TRANSFER_PARSER_OPTIONS);
    if (parseResult.program && !parseResult.errors?.length) {
      const bodyS = new MagicString(wrappedSource);

      const bodyImportedNames = new Set(jsxBodyOptions.importedNames);
      for (const [, varName] of qrlVarNames) {
        bodyImportedNames.add(varName);
      }

      let bodyQpOverrides: Map<number, string[]> | undefined;
      let bodyQrlsWithCaptures: Set<string> | undefined;
      {
        const qrlParamMap = new Map<string, string[]>();
        for (const child of nested) {
          if (child.ctxKind !== 'eventHandler') continue;
          if (child.paramNames.length < 2 || child.paramNames[0] !== '_' || child.paramNames[1] !== '_1') continue;
          const captureParams: string[] = [];
          for (let pi = 2; pi < child.paramNames.length; pi++) {
            const p = child.paramNames[pi];
            if (/^_\d+$/.test(p) || p === '_') continue;
            captureParams.push(p);
          }
          if (captureParams.length === 0) continue;
          const childVarName = qrlVarNames.get(child.symbolName) ?? `q_${child.symbolName}`;
          qrlParamMap.set(childVarName, captureParams);
          qrlParamMap.set(child.symbolName, captureParams);
        }

        if (qrlParamMap.size > 0) {
          bodyQpOverrides = new Map();
          bodyQrlsWithCaptures = new Set();
          walkAstForQp(parseResult.program, qrlParamMap, bodyQpOverrides, bodyQrlsWithCaptures);
          if (bodyQpOverrides.size === 0) {
            bodyQpOverrides = undefined;
            bodyQrlsWithCaptures = undefined;
          }
        }
      }

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

      const transformedWrapped = bodyS.toString();
      body = transformedWrapped.slice(wrapperPrefix.length);

      if (body.endsWith(';') && !ext.bodyText.endsWith(';')) {
        body = body.slice(0, -1);
      }

      for (const sym of bodyJsxResult.neededImports) {
        additionalImports.set(sym, '@qwik.dev/core');
      }
      if (bodyJsxResult.needsFragment) {
        additionalImports.set('Fragment as _Fragment', '@qwik.dev/core/jsx-runtime');
      }

      hoistedDeclarations.push(...bodyJsxResult.hoistedDeclarations);
      finalKeyCounterValue = bodyJsxResult.keyCounterValue;
    }
  }

  const hasNestedExts = allExtractions.some(e => e.parent === ext.symbolName);
  if (hasNestedExts) {
    body = removeDeadConstLiterals(body);
  }

  return { transformedBody: body, additionalImports, hoistedDeclarations, keyCounterValue: finalKeyCounterValue };
}

/**
 * Inline .s() body transformation for extracted segments.
 *
 * Rewrites nested call sites, inlines const literals, applies _rawProps
 * transformation, runs JSX transpilation, and eliminates dead const
 * declarations within extraction body text.
 */

import MagicString from 'magic-string';
import { parseSync } from 'oxc-parser';
import { forEachAstChild } from '../utils/ast.js';
import {
  RAW_TRANSFER_PARSER_OPTIONS,
  type AstFunction,
  type AstNode,
  type JSXAttribute,
  type JSXAttributeItem,
} from '../../ast-types.js';
import type { ExtractionResult, Mutable } from '../extract.js';
import type { ImportInfo } from '../marker-detection.js';
import { transformEventPropName } from '../transform/event-handlers.js';
import { transformAllJsx, JsxKeyCounter } from '../transform/jsx.js';
import { transformJsxCalls, collectJsxFunctionNamesFromIterable } from '../transform/jsx-call-transform.js';
import { computeKeyPrefix } from '../key-prefix.js';
import { SignalHoister } from '../signal-analysis.js';
import { getQrlImportSource } from '../rewrite-calls.js';
import { injectCapturesUnpacking, removeDeadConstLiterals } from '../segment-codegen.js';
import {
  resolveConstLiterals,
  resolveConstLiteralsInClosure,
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
  isComponentCtx,
  isEventHandlerOrJsxProp,
  matchesRegCtxName,
} from './predicates.js';

function getJsxAttrName(attr: JSXAttribute): string | null {
  if (attr.name.type === 'JSXIdentifier') return attr.name.name;
  if (attr.name.type === 'JSXNamespacedName') {
    return `${attr.name.namespace.name}:${attr.name.name.name}`;
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
  attrs: JSXAttributeItem[],
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
    if (attr.value.expression.type !== 'Identifier') continue;

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
  node: AstNode | null | undefined,
  qrlParamMap: Map<string, string[]>,
  qpOverrides: Map<number, string[]>,
  qrlsWithCaptures: Set<string>,
): void {
  if (!node) return;

  if (node.type === 'JSXElement' && node.openingElement) {
    const elementParams = collectQpParamsFromElement(node.openingElement.attributes, qrlParamMap, qrlsWithCaptures);
    if (elementParams.length > 0) {
      qpOverrides.set(node.start, elementParams);
    }
  }

  forEachAstChild(node, (child) => walkAstForQp(child, qrlParamMap, qpOverrides, qrlsWithCaptures));
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
  regCtxName?: readonly string[],
  sharedSignalHoister?: SignalHoister,
  /**
   * Closure AST nodes per extraction (keyed by symbolName). When supplied
   * together with `source`, lets the const-literal resolver skip its body
   * re-parse. See OSS-354.
   */
  closureNodes?: Map<string, AstFunction>,
  /** Source string the closures were parsed from — required when `closureNodes` is supplied. */
  source?: string,
  /**
   * Parent module imports — used to derive the jsx-runtime callable set for
   * the OSS-405 `jsx(...) → _jsxSorted(...)` rewrite in inline-strategy bodies.
   * When omitted (or empty for the module), the rewrite is skipped.
   */
  originalImports?: Map<string, ImportInfo>,
  /** Parent module's relative path — used for JSX key prefix derivation. */
  parentRelPath?: string,
  /** Shared JSX key counter value for continuation across .s(body) calls. */
  sharedKeyCounterStart?: number,
  /**
   * Names of module-level decls that migration is reexporting (`_auto_X`)
   * or moving. The default-strategy segment-file path filters these from
   * `captureNames` via `wireMigration` (`segment-generation.ts:756`); the
   * inline/hoist path needs the same filter because the body stays in the
   * parent and references the decl directly from module scope (no
   * `_captures[N]` indirection needed). Without the filter, the body gets
   * `const X = _captures[0]` injected on top of a `.w([])` call site that
   * was already filtered by `addCaptureWrapping` — phantom unpacking with
   * undefined values. See OSS-407.
   */
  migratedNames?: ReadonlySet<string>,
): { transformedBody: string; additionalImports: Map<string, string>; hoistedDeclarations: string[]; keyCounterValue?: number } {
  // `body` is locally mutable plain string for slicing/concatenation
  // throughout this transform. The branded BodyText only matters at the
  // ExtractionResult boundary; internal mutations work on string.
  let body: string = ext.bodyText;
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
        } else if (child.qrlCallee) {
          let replacement = child.qrlCallee + '(' + childVarName;

          if (child.captureNames.length > 0) {
            replacement += '.w([\n        ' + child.captureNames.join(',\n        ') + '\n    ])';
          }

          replacement += ')';
          body = body.slice(0, relCallStart) + replacement + body.slice(relCallEnd);

          additionalImports.set(child.qrlCallee, getQrlImportSource(child.qrlCallee, child.importSource));
        } else {
          // OSS-405: inlinedQrl children have empty `qrlCallee` (`extract.ts:696`)
          // — they're peer-tool-emitted spec args, not marker calls. Replacement
          // is just the `q_X.w([captures])` ref; wrapping it in `(`...`)` would
          // produce `useTaskQrl((q_X.w([...])))` (double parens) instead of
          // `useTaskQrl(q_X.w([...]))`.
          let replacement = childVarName;
          if (child.captureNames.length > 0) {
            replacement += '.w([\n        ' + child.captureNames.join(',\n        ') + '\n    ])';
          }
          body = body.slice(0, relCallStart) + replacement + body.slice(relCallEnd);
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
      const parentClosure = closureNodes?.get(parentExt.symbolName);
      const constValues = parentClosure && source !== undefined
        ? resolveConstLiteralsInClosure(parentClosure, source, ext.captureNames)
        : resolveConstLiterals(parentExt.bodyText, ext.captureNames);
      if (constValues.size > 0) {
        body = inlineConstCaptures(body, constValues);
        // OSS-389: const-literal inlining drops folded names from
        // captureNames + accumulates into constLiterals. Internal-builder
        // cast — ext is effectively transitioning toward consolidated.
        const wip = ext as Mutable<ExtractionResult>;
        wip.captureNames = wip.captureNames.filter(n => !constValues.has(n));
        wip.captures = wip.captureNames.length > 0;
        if (!wip.constLiterals) wip.constLiterals = constValues;
        else {
          const accumulator = wip.constLiterals as Map<string, string>;
          for (const [k, v] of constValues) accumulator.set(k, v);
        }
      }
    }
  }

  if (isRegCtx) {
    // regCtxName extractions don't use _captures
  } else if (ext.isInlinedQrl) {
    // OSS-405: peer-tool `inlinedQrl(body, name, [captures])` bodies are
    // self-contained — they already destructure captures themselves (e.g.
    // via `useLexicalScope()` in qwik-react codegen). Injecting `_captures`
    // unpacking on top would produce duplicate destructuring. Mirrors the
    // `resolveCaptureInfo` skip path used by the segment-file codegen.
  } else if (ext.captureNames.length > 0) {
    // OSS-407: filter migrated names — they're accessible via module scope
    // under inline/hoist (body stays in parent) so no `_captures[N]`
    // indirection is needed. Mirrors the symmetric filter in
    // `addCaptureWrapping` (`rewrite/index.ts:657`) that already skips
    // emitting `.w([X])` for migrated `X`. Without this body-side filter,
    // `const X = _captures[0]` got injected on top of an empty `.w()` call
    // site — phantom unpacking with undefined values.
    const effectiveCaptures = migratedNames && migratedNames.size > 0
      ? ext.captureNames.filter(n => !migratedNames.has(n))
      : ext.captureNames;
    if (effectiveCaptures.length > 0) {
      body = injectCapturesUnpacking(body, effectiveCaptures);
      additionalImports.set('_captures', '@qwik.dev/core');
    }
  }
  // _rawProps transform only applies to component$ extractions
  {
    const rawPropsResult = isComponentCtx(ext.ctxName) ? applyRawPropsTransform(body) : body;
    if (rawPropsResult !== body) {
      body = rawPropsResult;
      if (body.includes('_restProps(')) {
        additionalImports.set('_restProps', '@qwik.dev/core');
      }
      body = consolidateRawPropsInWCalls(body);
    }
  }

  if (ext.propsFieldCaptures && ext.propsFieldCaptures.size > 0) {
    // OSS-409 bug 2: pass propsFieldDefaults so defaulted fields emit
    // `(_rawProps.<key> ?? <default>)` (mirrors SWC's NullishCoalescing).
    body = replacePropsFieldReferencesInBody(
      body,
      ext.propsFieldCaptures,
      ext.propsFieldDefaults,
    );
  }

  body = propagateConstLiteralsInBody(body);

  let finalKeyCounterValue: number | undefined;

  // OSS-405: rewrite peer-tool `jsx(Tag, propsObj, ...)` calls (e.g. from
  // qwik-react codegen embedded inside `inlinedQrl(...)` bodies) into the
  // `_jsxSorted(tag, varProps, constProps, children, flags, key)` form. Mirrors
  // the Phase 5b path in segment-codegen (`transformSegmentJsxCalls`) — under
  // inline strategy, the body stays in the parent module rather than going
  // into a segment file, so this pass has to run here instead.
  if (originalImports && originalImports.size > 0) {
    const jsxFunctions = collectJsxFunctionNamesFromIterable(originalImports.values());
    if (jsxFunctions.size > 0) {
      let mentionsAny = false;
      for (const name of jsxFunctions) {
        if (body.includes(name + '(')) { mentionsAny = true; break; }
      }
      if (mentionsAny) {
        try {
          const wrappedBody = `(${body})`;
          const bodyParse = parseSync('__inline_body__.tsx', wrappedBody, RAW_TRANSFER_PARSER_OPTIONS);
          if (bodyParse.program && !bodyParse.errors?.length) {
            const callS = new MagicString(wrappedBody);
            const relPathForPrefix = parentRelPath ?? jsxBodyOptions?.relPath;
            const prefix = relPathForPrefix ? computeKeyPrefix(relPathForPrefix) : 'u6';
            const startAt = sharedKeyCounterStart ?? jsxBodyOptions?.keyCounterStart ?? 0;
            const keyCounter = new JsxKeyCounter(startAt, prefix);
            const callNeededImports = new Set<string>();
            transformJsxCalls(wrappedBody, callS, bodyParse.program, {
              jsxFunctions,
              keyCounter,
              neededImports: callNeededImports,
            });
            const rewritten = callS.toString();
            if (rewritten !== wrappedBody) {
              body = rewritten.slice(1, -1);
              for (const sym of callNeededImports) {
                additionalImports.set(sym, '@qwik.dev/core');
              }
              finalKeyCounterValue = keyCounter.current();
            }
          }
        } catch {
          // jsx-call rewrite failed; fall through with body unchanged.
        }
      }
    }
  }

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

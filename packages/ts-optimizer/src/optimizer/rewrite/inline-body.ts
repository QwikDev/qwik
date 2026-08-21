/** Inline .s() body transformation for extracted segments. */

import MagicString from 'magic-string';
import { parseWithRawTransfer } from '../ast/parse.js';
import { walkAstForQp } from '../jsx/qp-walk.js';
import { formatWCall, parseArrayItems, wCallSuffix } from '../qwik/w-call.js';
import type { AstFunction } from '../../ast-types.js';
import type { ExtractionResult, Mutable } from '../extraction/extract.js';
import type { ImportInfo } from '../extraction/marker-detection.js';
import { eventHandlerPropName } from '../jsx/event-handlers.js';
import { transformAllJsx, JsxKeyCounter } from '../jsx/jsx.js';
import {
  transformJsxCalls,
  collectJsxFunctionNamesFromIterable,
} from '../jsx/jsx-call-transform.js';
import { eventHandlerQpParams } from '../jsx/loop-hoisting.js';
import { computeKeyPrefix } from '../jsx/key-prefix.js';
import { SignalHoister } from '../jsx/signal-analysis.js';
import { foldBodySimplifiableExpressions } from '../jsx/simplify.js';
import { getQrlImportSource, buildSyncTransform } from './rewrite-calls.js';
import { foldConstantsInBodyText } from './const-replacement.js';
import { injectCapturesUnpacking, removeDeadConstLiterals } from '../segment/segment-codegen.js';
import { passiveEventsFromDisplayName } from '../segment/segment-generation.js';
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
  bodyConsolidatesToRawProps,
  consolidateQpCaptureValues,
  extractDestructuredFieldInfo,
  type InlineSegmentJsxOptions,
} from './raw-props.js';
import {
  hasUnderscorePlaceholderParams,
  isEventHandlerOrJsxProp,
  isStrippedExtraction,
  matchesRegCtxName,
} from './predicates.js';

/**
 * Transform an inline segment body: nested-call rewriting, const inlining, capture unpacking,
 * _rawProps, JSX, and dead-const removal.
 */
export function transformInlineSegmentBody(
  ext: ExtractionResult,
  allExtractions: ExtractionResult[],
  qrlVarNames: Map<string, string>,
  jsxBodyOptions?: InlineSegmentJsxOptions,
  regCtxName?: readonly string[],
  sharedSignalHoister?: SignalHoister,
  closureNodes?: Map<string, AstFunction>,
  source?: string,
  originalImports?: Map<string, ImportInfo>,
  parentRelPath?: string,
  sharedKeyCounterStart?: number,
  /**
   * Module-level decls that migration reexports or moves. Filtered from `captureNames` here because
   * under inline/hoist the body references them from module scope directly — no `_captures[N]`
   * indirection.
   */
  migratedNames?: ReadonlySet<string>,
  /**
   * Gates suppression of `.w([captures])` on stripped child QRLs in JSX-prop position: a stripped
   * child's body is `export const X = null` and cannot consume captures, so emit the bare `q_X` ref
   * instead.
   */
  stripCtxName?: readonly string[],
  stripEventHandlers?: boolean,
  /**
   * IsServer/isBrowser/isDev folding flags, applied here since this body sits outside the parent
   * MagicString.
   */
  isServer?: boolean,
  isDev?: boolean,
  /**
   * Cross-body hoister for `_fnSignal(...)` values from the `_jsxDEV(...)` rewrite; separate from
   * the JSX hoister (which gets reordered) so emitted `_hf<n>` refs stay aligned with their
   * declarations.
   */
  jsxCallHoister?: SignalHoister,
  /** Unified per-element q:ps arrays (slot order) — overrides per-child capture order. */
  elementQpParamsMap?: ReadonlyMap<string, string[]>
): {
  transformedBody: string;
  additionalImports: Map<string, string>;
  hoistedDeclarations: string[];
  keyCounterValue?: number;
} {
  let body: string = ext.bodyText;
  const additionalImports = new Map<string, string>();
  const hoistedDeclarations: string[] = [];

  const nested = allExtractions.filter((e) => e.parent === ext.symbolName);

  const rawPropsFieldMap: ReadonlyMap<string, string> | undefined = bodyConsolidatesToRawProps(
    ext.bodyText
  )
    ? extractDestructuredFieldInfo(ext.bodyText).fieldMap
    : undefined;
  const qpValues = (params: string[]): string[] =>
    rawPropsFieldMap === undefined ? params : consolidateQpCaptureValues(params, rawPropsFieldMap);

  if (nested.length > 0) {
    const bodyOffset = ext.argStart;
    const sortedNested = [...nested].sort((a, b) => b.callStart - a.callStart);
    const strippedLoopWDecls: Array<{ decl: string; symbolName: string }> = [];

    for (const child of sortedNested) {
      const childVarName = qrlVarNames.get(child.symbolName) ?? `q_${child.symbolName}`;

      const relCallStart = child.callStart - bodyOffset;
      const relCallEnd = child.callEnd - bodyOffset;

      if (relCallStart >= 0 && relCallEnd <= body.length) {
        if (child.isSync) {
          additionalImports.set('_qrlSync', '@qwik.dev/core');
          body =
            body.slice(0, relCallStart) +
            buildSyncTransform(child.bodyText) +
            body.slice(relCallEnd);
        } else if (child.isBare) {
          let replacement = childVarName;
          if (child.captureNames.length > 0) {
            replacement += wCallSuffix(child.captureNames, '        ', '    ');
          }
          body = body.slice(0, relCallStart) + replacement + body.slice(relCallEnd);
        } else if (isEventHandlerOrJsxProp(child.ctxKind) && !child.qrlCallee) {
          const propName = eventHandlerPropName(
            child.ctxName,
            child.isComponentEvent,
            passiveEventsFromDisplayName(child)
          );

          const isRegCtx = matchesRegCtxName(child, regCtxName);
          let qrlRef = isRegCtx ? `serverQrl(${childVarName})` : childVarName;
          if (isRegCtx) {
            const serverQrlSource = child.importSource || '@qwik.dev/core';
            additionalImports.set('serverQrl', serverQrlSource);
          }

          const hasLoopCrossCaptures =
            !isRegCtx &&
            child.captures &&
            child.captureNames.length > 0 &&
            hasUnderscorePlaceholderParams(child.paramNames, child.movedCaptures);

          // Stripped child segments emit `= null` bodies; their captures reach
          // the client positionally via the element's `q:p` prop instead of
          // `.w([…])` — except when the positional slots carry promoted loop
          // params, where the remaining lexical captures still need `.w()` via
          // a component-scope binding (the attr value must stay an identifier
          // for the `q:p` walk).
          const childIsStripped = isStrippedExtraction(child, stripCtxName, stripEventHandlers);
          const promotedParams = childIsStripped ? eventHandlerQpParams(child.paramNames) : [];

          if (childIsStripped && promotedParams.length > 0 && child.captureNames.length > 0) {
            const wCall = formatWCall(childVarName, child.captureNames, '            ', '        ');
            strippedLoopWDecls.push({
              decl: `const ${child.symbolName} = ${wCall};`,
              symbolName: child.symbolName,
            });
            qrlRef = child.symbolName;
          } else if (hasLoopCrossCaptures && !childIsStripped) {
            // The captures are component-scoped, so the `.w()` binding must
            // live in the component body, not at module level.
            const wCall = formatWCall(childVarName, child.captureNames, '            ', '        ');
            strippedLoopWDecls.push({
              decl: `const ${child.symbolName} = ${wCall};`,
              symbolName: child.symbolName,
            });
            qrlRef = child.symbolName;
          } else if (!isRegCtx && !childIsStripped && child.captureNames.length > 0) {
            qrlRef += wCallSuffix(child.captureNames, '        ', '    ');
          }

          // A handler from a pre-transformed `_jsxDEV(...)` props bag is an
          // object property, not a JSX attribute — replace with the bare QRL ref
          // (`onClick$: q_X`); the JSX-attribute form would break the object literal.
          // A kebab-cased name whose local part starts with '-' (onDOMContentLoaded$
          // → q-d:-d-o-m-...) can't re-parse as a JSX attribute — keep the original
          // attr name and let the JSX pass emit the final quoted key.
          const attrName = /:-/.test(propName) ? child.ctxName : propName;
          const replacement = child.isJsxObjectProp ? qrlRef : `${attrName}={${qrlRef}}`;
          body = body.slice(0, relCallStart) + replacement + body.slice(relCallEnd);
        } else if (child.qrlCallee) {
          let replacement = child.qrlCallee + '(' + childVarName;

          if (child.captureNames.length > 0) {
            replacement += wCallSuffix(child.captureNames, '        ', '    ');
          }

          // Preserve arguments after the extracted closure (e.g. task options).
          const relArgEnd = child.argEnd - bodyOffset;
          const trailingArgs =
            relArgEnd > relCallStart && relArgEnd < relCallEnd
              ? body.slice(relArgEnd, relCallEnd - 1)
              : '';
          replacement += trailingArgs + ')';
          body = body.slice(0, relCallStart) + replacement + body.slice(relCallEnd);

          additionalImports.set(
            child.qrlCallee,
            getQrlImportSource(child.qrlCallee, child.importSource)
          );
        } else {
          // inlinedQrl children have empty `qrlCallee` (peer-tool spec args),
          // so emit the bare `q_X.w([captures])` ref without a wrapper call.
          // Explicit capture arrays pass through verbatim — the body indexes
          // `_captures[N]`, so dropping or reordering entries breaks it.
          let replacement = childVarName;
          const childCaptureItems =
            child.isInlinedQrl && child.explicitCaptures
              ? parseArrayItems(child.explicitCaptures)
              : child.captureNames;
          if (childCaptureItems.length > 0) {
            replacement += wCallSuffix(childCaptureItems, '        ', '    ');
          }
          body = body.slice(0, relCallStart) + replacement + body.slice(relCallEnd);
        }
      }
    }

    // Component-scope `.w([…])` bindings for stripped loop handlers, placed
    // before the top-level statement that references them so their captures
    // (declared earlier in the body) are in scope. Statement boundaries come
    // from a parse — text scanning breaks on `;` inside type annotations.
    if (strippedLoopWDecls.length > 0) {
      const wrapperPrefixText = 'const __w__ = ';
      const wrapped = wrapperPrefixText + body + ';';
      const parsed = parseWithRawTransfer('__w__.tsx', wrapped);
      const init = parsed.program?.body?.[0];
      const arrow = init?.type === 'VariableDeclaration' ? init.declarations?.[0]?.init : undefined;
      const block =
        arrow &&
        (arrow.type === 'ArrowFunctionExpression' || arrow.type === 'FunctionExpression') &&
        arrow.body?.type === 'BlockStatement'
          ? arrow.body
          : null;
      if (block) {
        const inserts: Array<{ at: number; decl: string }> = [];
        for (const { decl, symbolName } of strippedLoopWDecls) {
          const usePos = body.indexOf(symbolName);
          if (usePos < 0) {
            continue;
          }
          const stmt = block.body.find(
            (st) =>
              st.start - wrapperPrefixText.length <= usePos &&
              usePos < st.end - wrapperPrefixText.length
          );
          if (stmt) {
            inserts.push({ at: stmt.start - wrapperPrefixText.length, decl });
          }
        }
        inserts.sort((a, b) => b.at - a.at);
        for (const { at, decl } of inserts) {
          body = body.slice(0, at) + `${decl}\n        ` + body.slice(at);
        }
      }
    }
  }

  if (ext.constLiterals && ext.constLiterals.size > 0) {
    body = inlineConstCaptures(body, ext.constLiterals);
  }

  // Explicit inlinedQrl captures are a pre-compiled contract with the body's
  // `_captures[N]` reads — never const-inline entries out of them.
  const hasExplicitCaptureContract = ext.isInlinedQrl && ext.explicitCaptures !== null;
  if (ext.captureNames.length > 0 && ext.parent !== null && !hasExplicitCaptureContract) {
    const parentExt = allExtractions.find((e) => e.symbolName === ext.parent);
    if (parentExt) {
      const parentClosure = closureNodes?.get(parentExt.symbolName);
      const constValues =
        parentClosure && source !== undefined
          ? resolveConstLiteralsInClosure(parentClosure, source, ext.captureNames)
          : resolveConstLiterals(parentExt.bodyText, ext.captureNames);
      if (constValues.size > 0) {
        body = inlineConstCaptures(body, constValues);
        const wip = ext as Mutable<ExtractionResult>;
        wip.captureNames = wip.captureNames.filter((n) => !constValues.has(n));
        wip.captures = wip.captureNames.length > 0;
        if (!wip.constLiterals) {
          wip.constLiterals = constValues;
        } else {
          const accumulator = wip.constLiterals as Map<string, string>;
          for (const [k, v] of constValues) {
            accumulator.set(k, v);
          }
        }
      }
    }
  }

  if (ext.isInlinedQrl) {
    // Peer-tool `inlinedQrl(...)` bodies destructure captures themselves;
    // injecting `_captures` unpacking would duplicate the destructuring.
  } else if (ext.captureNames.length > 0) {
    // Migrated names are in module scope under inline/hoist, so filter them
    // out — they don't need `_captures[N]` indirection.
    const effectiveCaptures =
      migratedNames && migratedNames.size > 0
        ? ext.captureNames.filter((n) => !migratedNames.has(n))
        : ext.captureNames;
    if (effectiveCaptures.length > 0) {
      body = injectCapturesUnpacking(body, effectiveCaptures);
      additionalImports.set('_captures', '@qwik.dev/core');
    }
  }
  {
    // Consolidate any destructured first param (component props AND hook
    // contexts like useComputed$'s { cleanup }) — a bare destructured method
    // call loses `this`. inlinedQrl bodies are pre-compiled and excluded.
    const rawPropsResult = !ext.isInlinedQrl ? applyRawPropsTransform(body) : body;
    if (rawPropsResult !== body) {
      body = rawPropsResult;
      if (body.includes('_restProps(')) {
        additionalImports.set('_restProps', '@qwik.dev/core');
      }
      body = consolidateRawPropsInWCalls(body);
    }
  }

  if (ext.propsFieldCaptures && ext.propsFieldCaptures.size > 0) {
    // Pass `propsFieldDefaults` so defaulted fields emit `(_rawProps.<key> ?? <default>)`.
    body = replacePropsFieldReferencesInBody(body, ext.propsFieldCaptures, ext.propsFieldDefaults);
  }

  body = propagateConstLiteralsInBody(body);

  let finalKeyCounterValue: number | undefined;

  // Rewrite peer-tool `jsx(...)` calls (e.g. qwik-react codegen inside
  // `inlinedQrl(...)` bodies) to `_jsxSorted(...)` form. Runs here because
  // under inline strategy the body stays in the parent, not a segment file.
  if (originalImports && originalImports.size > 0) {
    const jsxFunctions = collectJsxFunctionNamesFromIterable(originalImports.values());
    if (jsxFunctions.size > 0) {
      let mentionsAny = false;
      for (const name of jsxFunctions) {
        if (body.includes(name + '(')) {
          mentionsAny = true;
          break;
        }
      }
      if (mentionsAny) {
        try {
          const wrappedBody = `(${body})`;
          const bodyParse = parseWithRawTransfer('__inline_body__.tsx', wrappedBody);
          if (bodyParse.program && !bodyParse.errors?.length) {
            const callS = new MagicString(wrappedBody);
            const relPathForPrefix = parentRelPath ?? jsxBodyOptions?.relPath;
            const prefix = relPathForPrefix ? computeKeyPrefix(relPathForPrefix) : 'u6';
            const startAt = sharedKeyCounterStart ?? jsxBodyOptions?.keyCounterStart ?? 0;
            const keyCounter = new JsxKeyCounter(startAt, prefix);
            const callNeededImports = new Set<string>();
            // Map each child event handler's QRL var to its capture params so
            // the rewriter injects the owning element's capture prop — needed
            // for client resumption even when the body is inline or stripped.
            const qpByQrl = new Map<string, string[]>();
            for (const child of nested) {
              if (child.ctxKind !== 'eventHandler' && child.ctxKind !== 'jSXProp') {
                continue;
              }
              const params = eventHandlerQpParams(child.paramNames);
              if (params.length > 0) {
                qpByQrl.set(
                  qrlVarNames.get(child.symbolName) ?? `q_${child.symbolName}`,
                  qpValues(params)
                );
              }
            }
            const bodyJsxCallHoister = jsxCallHoister ?? new SignalHoister();
            const declsBefore = bodyJsxCallHoister.getDeclarations().length;
            const jsxCallImportedNames = originalImports
              ? new Set([...originalImports.values()].map((i) => i.localName))
              : new Set<string>();
            transformJsxCalls(wrappedBody, callS, bodyParse.program, {
              jsxFunctions,
              keyCounter,
              neededImports: callNeededImports,
              qpByQrl: qpByQrl.size > 0 ? qpByQrl : undefined,
              importedNames: jsxCallImportedNames,
              signalHoister: bodyJsxCallHoister,
              paramNames: ext.paramNames,
            });
            const rewritten = callS.toString();
            if (rewritten !== wrappedBody) {
              body = rewritten.slice(1, -1);
              for (const sym of callNeededImports) {
                additionalImports.set(sym, '@qwik.dev/core');
              }
              hoistedDeclarations.push(...bodyJsxCallHoister.getDeclarations().slice(declsBefore));
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
    // JSX dev-info needs source-relative line/col; without `sourcePosition`,
    // positions would be wrappedSource-relative (off by the body's line offset).
    let devOptionsForCall = jsxBodyOptions.devOptions;
    if (devOptionsForCall && jsxBodyOptions.source != null) {
      devOptionsForCall = {
        ...devOptionsForCall,
        sourcePosition: {
          source: jsxBodyOptions.source,
          bodyOriginOffset: ext.loc[0],
          wrapperPrefixLen: wrapperPrefix.length,
        },
      };
    }

    const parseResult = parseWithRawTransfer('__body__.tsx', wrappedSource);
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
          if (child.ctxKind !== 'eventHandler') {
            continue;
          }
          // The unified element array carries the client build's slot order;
          // per-child capture order would scramble multi-handler elements.
          const unified = elementQpParamsMap?.get(child.symbolName);
          const captureParams = unified ? [...unified] : eventHandlerQpParams(child.paramNames);
          if (captureParams.length === 0) {
            continue;
          }
          const childVarName = qrlVarNames.get(child.symbolName) ?? `q_${child.symbolName}`;
          const consolidated = qpValues(captureParams);
          qrlParamMap.set(childVarName, consolidated);
          qrlParamMap.set(child.symbolName, consolidated);
        }

        // Stripped event handlers emit `= null` bodies, so their captures can't
        // reach the runtime via `_captures[N]`; propagate them to the parent JSX
        // element's `q:p` var-prop instead, keyed by the post-rewrite QRL var.
        if (stripCtxName || stripEventHandlers) {
          for (const child of nested) {
            if (child.ctxKind !== 'eventHandler') {
              continue;
            }
            if (!child.captures || child.captureNames.length === 0) {
              continue;
            }
            const isStripped =
              (stripCtxName && stripCtxName.some((v) => child.ctxName.startsWith(v))) ||
              stripEventHandlers === true;
            if (!isStripped) {
              continue;
            }
            const childVarName = qrlVarNames.get(child.symbolName) ?? `q_${child.symbolName}`;
            if (qrlParamMap.has(childVarName)) {
              continue;
            }
            // The unified element array carries the client build's slot order;
            // per-child capture order would scramble multi-handler elements.
            const unified = elementQpParamsMap?.get(child.symbolName);
            const consolidated = qpValues(unified ? [...unified] : [...child.captureNames]);
            qrlParamMap.set(childVarName, consolidated);
            qrlParamMap.set(child.symbolName, consolidated);
          }
        }

        if (qrlParamMap.size > 0) {
          bodyQpOverrides = new Map();
          bodyQrlsWithCaptures = new Set();
          walkAstForQp(
            parseResult.program,
            (name) => qrlParamMap.get(name),
            bodyQpOverrides,
            bodyQrlsWithCaptures
          );
          if (bodyQpOverrides.size === 0) {
            bodyQpOverrides = undefined;
            bodyQrlsWithCaptures = undefined;
          }
        }
      }

      // A pre-compiled inlinedQrl handler value is a runtime call, not a
      // statically-known-const handler — its event entry classifies var.
      let bodyQrlsNonConst: Set<string> | undefined;
      for (const child of nested) {
        if (!child.isInlinedQrl) {
          continue;
        }
        (bodyQrlsNonConst ??= new Set()).add(
          qrlVarNames.get(child.symbolName) ?? `q_${child.symbolName}`
        );
      }

      const bodyJsxResult = transformAllJsx(
        {
          source: wrappedSource,
          s: bodyS,
          program: parseResult.program,
          importedNames: bodyImportedNames,
        },
        {
          skipRanges: [],
          devOptions: devOptionsForCall,
          keyCounterStart: sharedKeyCounterStart ?? jsxBodyOptions.keyCounterStart,
          qpOverrides: bodyQpOverrides,
          qrlsWithCaptures: bodyQrlsWithCaptures,
          qrlsNonConst: bodyQrlsNonConst,
          relPath: jsxBodyOptions.relPath,
          sharedSignalHoister,
          paramNames: ext.paramNames ? new Set(ext.paramNames) : undefined,
        }
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

  // Fold const flags before the simplify pass so dead branches collapse for DCE.
  if (originalImports && (isServer !== undefined || isDev !== undefined)) {
    body = foldConstantsInBodyText(body, originalImports, isServer, isDev);
  }

  const hasNestedExts = allExtractions.some((e) => e.parent === ext.symbolName);
  if (hasNestedExts) {
    body = removeDeadConstLiterals(body);
  }

  // Fold constant-foldable subtrees left by earlier passes (e.g. the `?? <default>`
  // RHS in non-JSX positions). Runs after JSX so `_hf<n>_str` stays source-form.
  body = foldBodySimplifiableExpressions(body);

  return {
    transformedBody: body,
    additionalImports,
    hoistedDeclarations,
    keyCounterValue: finalKeyCounterValue,
  };
}

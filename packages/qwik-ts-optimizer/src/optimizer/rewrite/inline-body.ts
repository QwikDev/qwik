/**
 * Inline .s() body transformation for extracted segments.
 */

import MagicString from 'magic-string';
import { parseSync } from 'oxc-parser';
import { walkAstForQp } from '../jsx/qp-walk.js';
import { formatWCall, wCallSuffix } from '../qwik/w-call.js';
import {
  RAW_TRANSFER_PARSER_OPTIONS,
  type AstFunction,
} from '../../ast-types.js';
import type { ExtractionResult, Mutable } from '../extraction/extract.js';
import type { ImportInfo } from '../extraction/marker-detection.js';
import { eventHandlerPropName } from '../jsx/event-handlers.js';
import { transformAllJsx, JsxKeyCounter } from '../jsx/jsx.js';
import { transformJsxCalls, collectJsxFunctionNamesFromIterable } from '../jsx/jsx-call-transform.js';
import { eventHandlerQpParams } from '../jsx/loop-hoisting.js';
import { computeKeyPrefix } from '../jsx/key-prefix.js';
import { SignalHoister } from '../jsx/signal-analysis.js';
import { foldBodySimplifiableExpressions } from '../jsx/simplify.js';
import { getQrlImportSource, buildSyncTransform } from './rewrite-calls.js';
import { foldConstantsInBodyText } from './const-replacement.js';
import { injectCapturesUnpacking, removeDeadConstLiterals } from '../segment/segment-codegen.js';
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
  isComponentCtx,
  isEventHandlerOrJsxProp,
  isStrippedExtraction,
  matchesRegCtxName,
} from './predicates.js';

/**
 * Transform an inline segment body: nested-call rewriting, const inlining,
 * capture unpacking, _rawProps, JSX, and dead-const removal.
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
   * Module-level decls that migration reexports or moves. Filtered from
   * `captureNames` here because under inline/hoist the body references them
   * from module scope directly — no `_captures[N]` indirection.
   */
  migratedNames?: ReadonlySet<string>,
  /**
   * Gates suppression of `.w([captures])` on stripped child QRLs in JSX-prop
   * position: a stripped child's body is `export const X = null` and cannot
   * consume captures, so emit the bare `q_X` ref instead.
   */
  stripCtxName?: readonly string[],
  stripEventHandlers?: boolean,
  /** isServer/isBrowser/isDev folding flags, applied here since this body sits outside the parent MagicString. */
  isServer?: boolean,
  isDev?: boolean,
  /** Cross-body hoister for `_fnSignal(...)` values from the `_jsxDEV(...)`
   * rewrite; separate from the JSX hoister (which gets reordered) so emitted
   * `_hf<n>` refs stay aligned with their declarations. */
  jsxCallHoister?: SignalHoister,
): { transformedBody: string; additionalImports: Map<string, string>; hoistedDeclarations: string[]; keyCounterValue?: number } {
  let body: string = ext.bodyText;
  const additionalImports = new Map<string, string>();
  const hoistedDeclarations: string[] = [];

  const nested = allExtractions.filter(e => e.parent === ext.symbolName);

  const rawPropsFieldMap: ReadonlyMap<string, string> | undefined =
    bodyConsolidatesToRawProps(ext.bodyText)
      ? extractDestructuredFieldInfo(ext.bodyText).fieldMap
      : undefined;
  const qpValues = (params: string[]): string[] =>
    rawPropsFieldMap === undefined
      ? params
      : consolidateQpCaptureValues(params, rawPropsFieldMap);

  if (nested.length > 0) {
    const bodyOffset = ext.argStart;
    const sortedNested = [...nested].sort((a, b) => b.callStart - a.callStart);

    for (const child of sortedNested) {
      const childVarName = qrlVarNames.get(child.symbolName) ?? `q_${child.symbolName}`;

      const relCallStart = child.callStart - bodyOffset;
      const relCallEnd = child.callEnd - bodyOffset;

      if (relCallStart >= 0 && relCallEnd <= body.length) {
        if (child.isSync) {
          additionalImports.set('_qrlSync', '@qwik.dev/core');
          body = body.slice(0, relCallStart) + buildSyncTransform(child.bodyText) + body.slice(relCallEnd);
        } else if (child.isBare) {
          let replacement = childVarName;
          if (child.captureNames.length > 0) {
            replacement += wCallSuffix(child.captureNames, '        ', '    ');
          }
          body = body.slice(0, relCallStart) + replacement + body.slice(relCallEnd);
        } else if (isEventHandlerOrJsxProp(child.ctxKind) && !child.qrlCallee) {
          // Passive detection is segment-codegen-path only, so pass an empty set.
          const propName = eventHandlerPropName(child.ctxName, child.isComponentEvent, new Set());

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

          // Stripped child segments emit `= null` bodies that cannot consume
          // captures, so skip the `.w([…])` wrap and emit the bare `q_X` ref.
          const childIsStripped = isStrippedExtraction(child, stripCtxName, stripEventHandlers);

          if (hasLoopCrossCaptures && !childIsStripped) {
            const hoistedName = child.symbolName;
            const wCall = formatWCall(childVarName, child.captureNames, '            ', '        ');
            hoistedDeclarations.push(`const ${hoistedName} = ${wCall};`);
            qrlRef = hoistedName;
          } else if (!isRegCtx && !childIsStripped && child.captureNames.length > 0) {
            qrlRef += wCallSuffix(child.captureNames, '        ', '    ');
          }

          // A handler from a pre-transformed `_jsxDEV(...)` props bag is an
          // object property, not a JSX attribute — replace with the bare QRL ref
          // (`onClick$: q_X`); the JSX-attribute form would break the object literal.
          const replacement = child.isJsxObjectProp ? qrlRef : `${propName}={${qrlRef}}`;
          body = body.slice(0, relCallStart) + replacement + body.slice(relCallEnd);
        } else if (child.qrlCallee) {
          let replacement = child.qrlCallee + '(' + childVarName;

          if (child.captureNames.length > 0) {
            replacement += wCallSuffix(child.captureNames, '        ', '    ');
          }

          replacement += ')';
          body = body.slice(0, relCallStart) + replacement + body.slice(relCallEnd);

          additionalImports.set(child.qrlCallee, getQrlImportSource(child.qrlCallee, child.importSource));
        } else {
          // inlinedQrl children have empty `qrlCallee` (peer-tool spec args),
          // so emit the bare `q_X.w([captures])` ref without a wrapper call.
          let replacement = childVarName;
          if (child.captureNames.length > 0) {
            replacement += wCallSuffix(child.captureNames, '        ', '    ');
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
    // Peer-tool `inlinedQrl(...)` bodies destructure captures themselves;
    // injecting `_captures` unpacking would duplicate the destructuring.
  } else if (ext.captureNames.length > 0) {
    // Migrated names are in module scope under inline/hoist, so filter them
    // out — they don't need `_captures[N]` indirection.
    const effectiveCaptures = migratedNames && migratedNames.size > 0
      ? ext.captureNames.filter(n => !migratedNames.has(n))
      : ext.captureNames;
    if (effectiveCaptures.length > 0) {
      body = injectCapturesUnpacking(body, effectiveCaptures);
      additionalImports.set('_captures', '@qwik.dev/core');
    }
  }
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
    // Pass `propsFieldDefaults` so defaulted fields emit `(_rawProps.<key> ?? <default>)`.
    body = replacePropsFieldReferencesInBody(
      body,
      ext.propsFieldCaptures,
      ext.propsFieldDefaults,
    );
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
            // Map each child event handler's QRL var to its capture params so
            // the rewriter injects the owning element's capture prop — needed
            // for client resumption even when the body is inline or stripped.
            const qpByQrl = new Map<string, string[]>();
            for (const child of nested) {
              if (child.ctxKind !== 'eventHandler' && child.ctxKind !== 'jSXProp') continue;
              const params = eventHandlerQpParams(child.paramNames);
              if (params.length > 0) {
                qpByQrl.set(qrlVarNames.get(child.symbolName) ?? `q_${child.symbolName}`, qpValues(params));
              }
            }
            const bodyJsxCallHoister = jsxCallHoister ?? new SignalHoister();
            const declsBefore = bodyJsxCallHoister.getDeclarations().length;
            const jsxCallImportedNames = originalImports
              ? new Set([...originalImports.values()].map(i => i.localName))
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
          const captureParams = eventHandlerQpParams(child.paramNames);
          if (captureParams.length === 0) continue;
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
            if (child.ctxKind !== 'eventHandler') continue;
            if (!child.captures || child.captureNames.length === 0) continue;
            const isStripped =
              (stripCtxName && stripCtxName.some(v => child.ctxName.startsWith(v))) ||
              (stripEventHandlers === true);
            if (!isStripped) continue;
            const childVarName = qrlVarNames.get(child.symbolName) ?? `q_${child.symbolName}`;
            if (qrlParamMap.has(childVarName)) continue;
            const consolidated = qpValues([...child.captureNames]);
            qrlParamMap.set(childVarName, consolidated);
            qrlParamMap.set(child.symbolName, consolidated);
          }
        }

        if (qrlParamMap.size > 0) {
          bodyQpOverrides = new Map();
          bodyQrlsWithCaptures = new Set();
          walkAstForQp(parseResult.program, (name) => qrlParamMap.get(name), bodyQpOverrides, bodyQrlsWithCaptures);
          if (bodyQpOverrides.size === 0) {
            bodyQpOverrides = undefined;
            bodyQrlsWithCaptures = undefined;
          }
        }
      }

      const bodyJsxResult = transformAllJsx(
        { source: wrappedSource, s: bodyS, program: parseResult.program, importedNames: bodyImportedNames },
        {
          skipRanges: [],
          devOptions: devOptionsForCall,
          keyCounterStart: jsxBodyOptions.keyCounterStart,
          qpOverrides: bodyQpOverrides,
          qrlsWithCaptures: bodyQrlsWithCaptures,
          relPath: jsxBodyOptions.relPath,
          sharedSignalHoister,
        },
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

  const hasNestedExts = allExtractions.some(e => e.parent === ext.symbolName);
  if (hasNestedExts) {
    body = removeDeadConstLiterals(body);
  }

  // Fold constant-foldable subtrees left by earlier passes (e.g. the `?? <default>`
  // RHS in non-JSX positions). Runs after JSX so `_hf<n>_str` stays source-form.
  body = foldBodySimplifiableExpressions(body);

  return { transformedBody: body, additionalImports, hoistedDeclarations, keyCounterValue: finalKeyCounterValue };
}

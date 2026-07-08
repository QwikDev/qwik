/**
 * Inline .s() body transformation for extracted segments.
 *
 * Rewrites nested call sites, inlines const literals, applies _rawProps
 * transformation, runs JSX transpilation, and eliminates dead const
 * declarations within extraction body text.
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
   * re-parse.
   */
  closureNodes?: Map<string, AstFunction>,
  /** Source string the closures were parsed from — required when `closureNodes` is supplied. */
  source?: string,
  /**
   * Parent module imports — used to derive the jsx-runtime callable set
   * for the `jsx(...) → _jsxSorted(...)` rewrite in inline-strategy
   * bodies. When omitted (or empty for the module), the rewrite is
   * skipped.
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
   * undefined values.
   */
  migratedNames?: ReadonlySet<string>,
  /**
   * Strip-config gates suppression of `.w([captures])` wrapping on
   * stripped child QRLs in JSX prop position. When a child is stripped,
   * its body is `export const X = null` and cannot consume captures;
   * SWC's reference emits the bare QRL ref (`q_X`) instead of
   * `q_X.w([…])`. Only the event-handler JSX-prop path is gated —
   * marker-call (`qrlCallee`) and inlinedQrl paths preserve their
   * existing emission shape because stripped extractions don't appear
   * in those positions for the strip-mode fixtures.
   */
  stripCtxName?: readonly string[],
  stripEventHandlers?: boolean,
  /** Server/dev flags for isServer/isBrowser/isDev folding, applied here since this body sits outside the parent MagicString. */
  isServer?: boolean,
  isDev?: boolean,
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
          // Empty passive set: passive detection is segment-codegen-path
          // only (see eventHandlerPropName's contract).
          const propName = eventHandlerPropName(child.ctxName, child.isComponentEvent, new Set());

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

          // Stripped child segments emit `= null` bodies that cannot
          // consume captures at runtime. SWC's reference suppresses the
          // `.w([…])` wrapper at the JSX-prop call site and emits the
          // bare `q_X` ref. Skip the wrap regardless of capture count
          // when the child is stripped.
          const childIsStripped = isStrippedExtraction(child, stripCtxName, stripEventHandlers);

          if (hasLoopCrossCaptures && !childIsStripped) {
            const hoistedName = child.symbolName;
            const wCall = formatWCall(childVarName, child.captureNames, '            ', '        ');
            hoistedDeclarations.push(`const ${hoistedName} = ${wCall};`);
            qrlRef = hoistedName;
          } else if (!isRegCtx && !childIsStripped && child.captureNames.length > 0) {
            qrlRef += wCallSuffix(child.captureNames, '        ', '    ');
          }

          // A handler extracted from a pre-transformed `_jsxDEV(...)` props
          // bag is an object property (`onClick$: () => …`), not a raw JSX
          // attribute. Its call site is the bare value, so replace it with
          // just the QRL ref — `onClick$: q_X`. Emitting `q-e:click={q_X}`
          // (the JSX-attribute form) here would splice attribute syntax into
          // an object literal (`onClick$: q-e:click={q_X}`), which is a
          // fatal parse error. The runtime handles the author-form
          // `onClick$` prop on `_jsxDEV` natively (the same shape that was
          // inline before extraction), so no key rename is needed.
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
          // inlinedQrl children have empty `qrlCallee` — they're
          // peer-tool-emitted spec args, not marker calls. Replacement
          // is just the `q_X.w([captures])` ref; wrapping it in
          // `(`...`)` would produce `useTaskQrl((q_X.w([...])))` (double
          // parens) instead of `useTaskQrl(q_X.w([...]))`.
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
        // Const-literal inlining drops folded names from `captureNames`
        // + accumulates into `constLiterals`. Internal-builder cast —
        // `ext` is effectively transitioning toward consolidated.
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
    // Peer-tool `inlinedQrl(body, name, [captures])` bodies are
    // self-contained — they already destructure captures themselves
    // (e.g. via `useLexicalScope()` in qwik-react codegen). Injecting
    // `_captures` unpacking on top would produce duplicate destructuring.
    // Mirrors the `resolveCaptureInfo` skip path used by the segment-file
    // codegen.
  } else if (ext.captureNames.length > 0) {
    // Filter migrated names — they're accessible via module scope under
    // inline/hoist (body stays in parent) so no `_captures[N]`
    // indirection is needed. Mirrors the symmetric filter in
    // `addCaptureWrapping` that already skips emitting `.w([X])` for
    // migrated `X`. Without this body-side filter, `const X =
    // _captures[0]` got injected on top of an empty `.w()` call site —
    // phantom unpacking with undefined values.
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
    // Pass `propsFieldDefaults` so defaulted fields emit
    // `(_rawProps.<key> ?? <default>)` (mirrors SWC's NullishCoalescing).
    body = replacePropsFieldReferencesInBody(
      body,
      ext.propsFieldCaptures,
      ext.propsFieldDefaults,
    );
  }

  body = propagateConstLiteralsInBody(body);

  let finalKeyCounterValue: number | undefined;

  // Rewrite peer-tool `jsx(Tag, propsObj, ...)` calls (e.g. from
  // qwik-react codegen embedded inside `inlinedQrl(...)` bodies) into
  // the `_jsxSorted(tag, varProps, constProps, children, flags, key)`
  // form. Mirrors the segment-codegen jsx-call rewrite — under inline
  // strategy, the body stays in the parent module rather than going
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
            // Map each child event handler's QRL var to its q:p/q:ps capture
            // params so the peer-tool rewriter injects the owning element's
            // capture prop. The handler body stays inline here (hoist/inline
            // strategy), but the prop is still needed for client resumption —
            // even for stripped handlers whose body became a noop.
            const qpByQrl = new Map<string, string[]>();
            for (const child of nested) {
              if (child.ctxKind !== 'eventHandler' && child.ctxKind !== 'jSXProp') continue;
              const params = eventHandlerQpParams(child.paramNames);
              if (params.length > 0) {
                qpByQrl.set(qrlVarNames.get(child.symbolName) ?? `q_${child.symbolName}`, params);
              }
            }
            transformJsxCalls(wrappedBody, callS, bodyParse.program, {
              jsxFunctions,
              keyCounter,
              neededImports: callNeededImports,
              qpByQrl: qpByQrl.size > 0 ? qpByQrl : undefined,
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
    // JSX dev-info needs source-relative line/col. Inside this function,
    // `wrappedSource` is the JSX parser's input; without the
    // `sourcePosition`, dev-info positions would be wrappedSource-relative
    // (i.e. body-relative, off by the body's source-line offset).
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
          qrlParamMap.set(childVarName, captureParams);
          qrlParamMap.set(child.symbolName, captureParams);
        }

        // Stripped event handlers' bodies emit `= null`, so their
        // captures can't reach the runtime via `_captures[N]`. SWC
        // propagates those captures to the parent JSX element's `q:p`
        // var-prop instead. Mirror by adding stripped extractions'
        // captureNames into `qrlParamMap` keyed by the post-rewrite QRL
        // var name (e.g. `q_qrl_4294…`) that the body now references.
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
            qrlParamMap.set(childVarName, [...child.captureNames]);
            qrlParamMap.set(child.symbolName, [...child.captureNames]);
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
          skipRanges: [], // No skip ranges within the body
          devOptions: devOptionsForCall,
          keyCounterStart: jsxBodyOptions.keyCounterStart,
          // enableSignals defaults to true
          qpOverrides: bodyQpOverrides, // q:p/q:ps injection
          qrlsWithCaptures: bodyQrlsWithCaptures, // var/const prop classification
          relPath: jsxBodyOptions.relPath, // key prefix derivation
          sharedSignalHoister, // _hf counter continuity
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

  // Fold constant-foldable subtrees that survived earlier passes —
  // typically the `?? <default>` RHS injected by
  // `replacePropsFieldReferencesInBody` in non-JSX positions like
  // `console.log(_rawProps.X ?? 1+2)`. Runs AFTER JSX transform so
  // `_hf<n>_str` has already been generated from source-form positions
  // and stays source-preserving; JSX-prop positions are now
  // `_fnSignal(...)` calls with no `?? <default>` left to fold.
  body = foldBodySimplifiableExpressions(body);

  return { transformedBody: body, additionalImports, hoistedDeclarations, keyCounterValue: finalKeyCounterValue };
}

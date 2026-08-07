import type { Diagnostic } from '@qwik.dev/optimizer';
import type {
  CollectionSourcePlan,
  ComponentOutput,
  OrderedPropPlan,
  RenderFunctionPlan,
  RenderNodePlan,
  SetupPlan,
  ValuePlan,
} from './plan-types';
import { planSsr, type SsrComponentReturnModeResolver } from './plan-ssr';
import { locatedDiagnostic, TransformDiagnosticCode } from './transform-diagnostics';
import type { SourceRange } from './types';
import { hasPluginTarget } from './expr-lower';

/**
 * Native target readiness (specs/09): every site an engine must evaluate server-side needs a
 * portable lowering — `ir` on values, `op` on setup statements, structural plans for components.
 * All checks are inert unless `nativeTarget` is set; the JS path keeps its source-text fallbacks.
 */
export function validateNativeReadiness(
  file: string,
  source: string,
  outputs: readonly ComponentOutput[],
  returnMode: SsrComponentReturnModeResolver
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const snippet = (range: SourceRange): string => {
    const text = source.slice(range[0], range[1]).replace(/\s+/g, ' ');
    return text.length > 60 ? `${text.slice(0, 57)}...` : text;
  };
  const report = (range: SourceRange, code: TransformDiagnosticCode, message: string): void => {
    diagnostics.push(locatedDiagnostic(file, source, range, code, message).diagnostic);
  };

  const findUnimplementedPluginCall = (ir: unknown): string | null => {
    if (ir === null || typeof ir !== 'object') {
      return null;
    }
    if (Array.isArray(ir)) {
      for (const item of ir) {
        const found = findUnimplementedPluginCall(item);
        if (found !== null) {
          return found;
        }
      }
      return null;
    }
    const record = ir as Record<string, unknown>;
    if (
      record.kind === 'plugin-call' &&
      typeof record.fnId === 'string' &&
      !hasPluginTarget(record.fnId, 'rust')
    ) {
      return record.fnId;
    }
    for (const value of Object.values(record)) {
      const found = findUnimplementedPluginCall(value);
      if (found !== null) {
        return found;
      }
    }
    return null;
  };

  const requireIr = (value: ValuePlan | null, site: string): void => {
    if (value === null || value.kind === 'render-value') {
      return;
    }
    if (value.ir !== undefined) {
      const fnId = findUnimplementedPluginCall(value.ir);
      if (fnId !== null) {
        report(
          value.expression,
          TransformDiagnosticCode.NativeExpression,
          `${site} \`${snippet(value.expression)}\` calls ${fnId} which has no native ` +
            `implementation. Provide one with native$ (compiler plugin).`
        );
      }
      return;
    }
    report(
      value.expression,
      TransformDiagnosticCode.NativeExpression,
      `${site} \`${snippet(value.expression)}\` cannot be lowered for a native target. ` +
        `Rewrite it with supported syntax, extract it to a computed, or claim it with a compiler plugin.`
    );
  };

  const validateProps = (props: readonly OrderedPropPlan[]): void => {
    for (const prop of props) {
      switch (prop.kind) {
        case 'dynamic':
        case 'spread':
        case 'bind':
          requireIr(prop.value, `prop expression`);
          break;
        case 'inner-html':
          if (typeof prop.value === 'object' && prop.value !== null) {
            requireIr(prop.value, `prop expression`);
          }
          break;
        default:
          // static props are literal; event/ref handlers never run server-side
          break;
      }
    }
  };

  const validateSetup = (setup: readonly SetupPlan[]): void => {
    for (const entry of setup) {
      if (entry.kind === 'statement' && entry.op === undefined) {
        report(
          entry.range,
          TransformDiagnosticCode.NativeSetupStatement,
          `setup statement \`${snippet(entry.range)}\` cannot be lowered to a setup opcode for a native target.`
        );
      }
      if (entry.kind === 'render-value') {
        validateNodes(entry.render.render.roots);
      }
      if (entry.kind === 'local-component') {
        validateRenderFn(entry.render);
      }
    }
  };

  const validateCollectionSource = (collectionSource: CollectionSourcePlan): void => {
    if (collectionSource.kind === 'direct-reactive') {
      return;
    }
    if (collectionSource.ir === undefined) {
      report(
        collectionSource.expression,
        TransformDiagnosticCode.NativeExpression,
        `collection source \`${snippet(collectionSource.expression)}\` cannot be lowered for a native target.`
      );
    }
  };

  const validateRenderFn = (fn: RenderFunctionPlan | null): void => {
    if (fn === null) {
      return;
    }
    validateSetup(fn.setup);
    validateNodes(fn.render.roots);
  };

  const validateNodes = (nodes: readonly RenderNodePlan[]): void => {
    for (const node of nodes) {
      switch (node.kind) {
        case 'element':
          validateProps(node.props);
          validateNodes(node.children);
          break;
        case 'dynamic-value':
          requireIr(node.value, 'expression');
          break;
        case 'component':
          validateProps(node.props);
          for (const slot of node.slots) {
            validateRenderFn(slot.render);
          }
          break;
        case 'branch':
          if (node.conditionIr === undefined) {
            report(
              node.range,
              TransformDiagnosticCode.NativeExpression,
              `branch condition cannot be lowered for a native target.`
            );
          }
          validateRenderFn(node.then);
          validateRenderFn(node.else);
          break;
        case 'suspense':
          requireIr(node.delay, 'Suspense delay');
          // segment fallbacks plan structurally (fallbackRender); anything else cannot render
          if (node.fallback !== null && node.fallback.kind !== 'segment') {
            report(
              node.fallback.expression,
              TransformDiagnosticCode.NativeExpression,
              `Suspense fallback$ has no structural plan and cannot render on a native target.`
            );
          }
          validateRenderFn(node.content);
          break;
        case 'slot':
          validateRenderFn(node.fallback);
          break;
        case 'collection':
          validateCollectionSource(node.source);
          if (node.key !== null && node.keyIr === undefined) {
            report(
              node.range,
              TransformDiagnosticCode.NativeExpression,
              `collection key cannot be lowered for a native target.`
            );
          }
          validateRenderFn(node.row);
          break;
        default:
          break;
      }
    }
  };

  for (const output of outputs) {
    const componentRange = output.component.replacementRange;
    if (planSsr(output.result, returnMode) === null) {
      report(
        componentRange,
        TransformDiagnosticCode.NativeComponentUnplannable,
        `component "${output.component.identity}" cannot be planned structurally for a native target.`
      );
      continue;
    }
    if (output.result.hasCustomHook) {
      report(
        componentRange,
        TransformDiagnosticCode.NativeCustomHook,
        `component "${output.component.identity}" calls a non-core hook; native targets support core hooks only.`
      );
    }
    validateSetup(output.result.setup);
    validateNodes(output.result.render.roots);
  }
  return diagnostics;
}

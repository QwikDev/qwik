import { applyReplacements } from './emit-qrl';
import type { FunctionRenderPlan, RenderFunctionPlan, SegmentPlan } from './plan-types';
import { QwikWord, type GeneratedNames } from './words';

interface EmittedFunctionRender {
  readonly hoists: readonly string[];
  readonly statements: readonly string[];
  readonly value: string;
  readonly directSegmentIds?: readonly string[];
}

export type FunctionRenderEmitter = (
  symbolName: string,
  render: RenderFunctionPlan,
  source: string,
  imports: Set<string>,
  segments: readonly SegmentPlan[],
  inputPath: string,
  explicitExtensions: boolean,
  generatedNames: GeneratedNames
) => EmittedFunctionRender | null;

export interface EmittedFunctionRenders {
  readonly hoists: readonly string[];
  readonly replacements: readonly { range: SegmentPlan['range']; value: string }[];
  readonly directSegmentIds: readonly string[];
}

export function emitFunctionRenders(
  functions: readonly FunctionRenderPlan[],
  source: string,
  inputPath: string,
  explicitExtensions: boolean,
  imports: Set<string>,
  segments: readonly SegmentPlan[],
  emitRender: FunctionRenderEmitter,
  generatedNames: GeneratedNames
): EmittedFunctionRenders | null {
  const hoists: string[] = [];
  const replacements: Array<{ range: SegmentPlan['range']; value: string }> = [];
  const directSegmentIds = new Set<string>();
  if (functions.length > 0) {
    imports.add(QwikWord.GetActiveInvokeContext);
    imports.add('invoke');
  }
  const contextPrelude = `\n  const ${generatedNames.invokeCtx} = ${QwikWord.GetActiveInvokeContext}();\n  const ${generatedNames.ctx} = ${generatedNames.invokeCtx}.container;`;
  for (const fn of functions) {
    const renderReplacements: Array<{ range: SegmentPlan['range']; value: string }> = [];
    for (let index = 0; index < fn.renders.length; index++) {
      const render = fn.renders[index];
      const emitted = emitRender(
        `function_${fn.functionRange[0]}_${index}`,
        render,
        source,
        imports,
        segments,
        inputPath,
        explicitExtensions,
        generatedNames
      );
      if (emitted === null) {
        return null;
      }
      hoists.push(...emitted.hoists);
      emitted.directSegmentIds?.forEach((id) => directSegmentIds.add(id));
      const eager = emitEmbeddedRenderExpression(emitted, render.async, generatedNames.invokeCtx);
      renderReplacements.push({
        range: render.range,
        value: render.argumentPosition
          ? // a root value handed to a callee: defer into the callee's own invoke scope
            `(() => {${contextPrelude}\n  return ${eager};\n})`
          : eager,
      });
    }
    const needsPrelude = fn.renders.some((render) => !render.argumentPosition);
    if (fn.bodyKind === 'expression') {
      const body = applyReplacements(source, fn.bodyRange, renderReplacements);
      replacements.push({
        range: fn.bodyRange,
        value: needsPrelude ? `(() => {${contextPrelude}\n  return ${body};\n})()` : `(${body})`,
      });
    } else {
      replacements.push(...renderReplacements);
      if (needsPrelude) {
        // deferred roots carry their own prelude; an entry called outside any context must not
        replacements.push({
          range: [fn.bodyRange[0] + 1, fn.bodyRange[0] + 1],
          value: contextPrelude,
        });
      }
    }
  }
  return { hoists, replacements, directSegmentIds: [...directSegmentIds] };
}

export function emitEmbeddedRenderExpression(
  rendered: EmittedFunctionRender,
  async: boolean,
  invokeContextName: string
): string {
  const body = [...rendered.statements, `return ${rendered.value};`]
    .map((statement) => `  ${statement}`)
    .join('\n');
  return `invoke(${invokeContextName}, () => (${async ? 'async ' : ''}() => {\n${body}\n})())`;
}

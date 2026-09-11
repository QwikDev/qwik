import type { BindingPattern, Program, TSTypeAnnotation } from 'oxc-parser';
import { createOriginalRangeMapper } from '../../src/normalization';
import type { ModulePlan } from '../schema';
import { createBindingGraph, type BindingGraph } from './ast/bindings';

/** Preserve declared contracts before TypeScript syntax disappears from executable payloads. */
export function recordTypeContracts(
  plan: ModulePlan,
  program: Program,
  authoredCode: string,
  graph?: BindingGraph
): void {
  const authored = graph ?? createBindingGraph(program);
  const contracts = new Set<string>();
  for (const binding of authored.bindings) {
    for (const declaration of authored.declarationsOf(binding.id)) {
      const pattern =
        declaration.type === 'VariableDeclarator'
          ? declaration.id
          : declaration.type === 'Identifier' ||
              declaration.type === 'ObjectPattern' ||
              declaration.type === 'ArrayPattern'
            ? (declaration as BindingPattern)
            : null;
      const annotation = (pattern as { typeAnnotation?: TSTypeAnnotation | null } | null)
        ?.typeAnnotation;
      const fn = declaration.type === 'VariableDeclarator' ? declaration.init : declaration;
      const hasReturnType =
        (fn?.type === 'FunctionDeclaration' ||
          fn?.type === 'FunctionExpression' ||
          fn?.type === 'ArrowFunctionExpression') &&
        fn.returnType != null;
      if ((annotation != null || hasReturnType) && binding.declarationRange !== null) {
        contracts.add(`${binding.declarationRange[0]}:${binding.name}`);
      }
    }
  }
  const mapRange =
    plan.source.normalizationMap === null
      ? (range: [number, number]) => range
      : createOriginalRangeMapper(plan.source.code, authoredCode, {
          ...plan.source.normalizationMap,
          sourcesContent: plan.source.normalizationMap.sourcesContent?.map(
            (source) => source ?? ''
          ),
        });
  const bindings: { binding: number; start: number }[] = [];
  for (const binding of plan.bindings) {
    if (binding.declarationRange === null) {
      continue;
    }
    const start = mapRange(binding.declarationRange)[0];
    if (contracts.has(`${start}:${binding.name}`)) {
      bindings.push({ binding: binding.id, start });
    }
  }
  plan.source.types = { code: authoredCode, bindings };
}

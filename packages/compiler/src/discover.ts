import type { Program } from 'oxc-parser';
import { getParams, getRange } from './ast-utils';
import type { AstFunction, AstNode, SourceRange } from './types';
import { analyzeModule } from './analysis';
import { analyzeComponentShape } from './shape';
import type {
  ComponentCandidatePlan,
  ComponentShape,
  ModuleAnalysis,
  ComponentDefinition,
} from './plan-types';

export interface ComponentCandidate {
  readonly plan: ComponentCandidatePlan;
  readonly fn: AstFunction;
}

export function discoverComponentCandidates(
  program: Program,
  analysis: ModuleAnalysis
): ComponentCandidate[] {
  return analysis.items.flatMap((item) =>
    item.kind !== 'component-candidate'
      ? []
      : item.candidates.flatMap((plan) => {
          const fn = findFunctionByRange(program, plan.functionRange);
          return fn === null ? [] : [{ plan, fn }];
        })
  );
}

export function createComponentDefinition(
  candidate: ComponentCandidate,
  shape: ComponentShape
): ComponentDefinition {
  const { plan, fn } = candidate;
  return {
    bindingId: plan.bindingId,
    shape,
    exported: plan.exported,
    declarationKind: plan.declarationKind,
    exportName: plan.exportName,
    localName: plan.localName,
    functionRange: getRange(fn),
    replacementRange: plan.replacementRange,
    params: getParams(fn),
    body: fn.body!,
  };
}

/** Focused lowering-test helper; production uses candidates plus explicit shape errors. */
export function discoverComponents(
  program: Program,
  analysis: ModuleAnalysis = analyzeModule(program)
): ComponentDefinition[] {
  return discoverComponentCandidates(program, analysis).flatMap((candidate) => {
    const result = analyzeComponentShape(candidate.fn, candidate.plan.bindingId, analysis);
    return result.kind === 'failure' ? [] : [createComponentDefinition(candidate, result.shape)];
  });
}

function findFunctionByRange(program: Program, expected: SourceRange): AstFunction | null {
  let found: AstFunction | null = null;
  visit(program);
  return found;

  function visit(node: unknown): void {
    if (found !== null || !isNode(node)) {
      return;
    }
    if (isFunctionNode(node) && sameRange(getRange(node), expected)) {
      found = node;
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      if (SKIPPED_KEYS.has(key)) {
        continue;
      }
      if (Array.isArray(value)) {
        for (const child of value) {
          visit(child);
        }
      } else {
        visit(value);
      }
    }
  }
}

function isFunctionNode(node: AstNode): node is AstFunction {
  return (
    node.type === 'FunctionDeclaration' ||
    node.type === 'FunctionExpression' ||
    node.type === 'ArrowFunctionExpression'
  );
}

function sameRange(left: SourceRange | null, right: SourceRange): boolean {
  return left !== null && left[0] === right[0] && left[1] === right[1];
}

function isNode(node: unknown): node is AstNode {
  return !!node && typeof node === 'object' && 'type' in node && typeof node.type === 'string';
}

const SKIPPED_KEYS = new Set([
  'type',
  'start',
  'end',
  'range',
  'loc',
  'decorators',
  'typeAnnotation',
  'typeParameters',
  'returnType',
]);

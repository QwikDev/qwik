import type {
  ComponentPlan,
  ExtractedQrls,
  ModuleAnalysis,
  ComponentDefinition,
} from './plan-types';
import type { SourceRange } from './types';
import { lowerSemanticComponentPlan } from './semantic-lower';
import type { SemanticLowerFailureCode } from './semantic-lower';
import { validateComponentPlan } from './validate-component-plan';

export type LowerComponentResult =
  | { readonly kind: 'success'; readonly plan: ComponentPlan }
  | {
      readonly kind: 'failure';
      readonly code: SemanticLowerFailureCode;
      readonly range: SourceRange;
      readonly message: string;
    };

export function lowerComponentResult(
  component: ComponentDefinition,
  extractedQrls: ExtractedQrls,
  analysis: ModuleAnalysis
): LowerComponentResult {
  const lowered = lowerSemanticComponentPlan(component, extractedQrls);
  if (lowered.kind === 'failure') {
    return lowered;
  }
  return validateComponentPlan(lowered.plan, analysis).length === 0
    ? { kind: 'success', plan: lowered.plan }
    : {
        kind: 'failure',
        code: 'unsupported-syntax',
        range: component.shape.returnExpression,
        message: 'The lowered component plan failed validation.',
      };
}

export function lowerComponent(
  component: ComponentDefinition,
  extractedQrls: ExtractedQrls,
  analysis: ModuleAnalysis
): ComponentPlan | null {
  const lowered = lowerComponentResult(component, extractedQrls, analysis);
  return lowered.kind === 'success' ? lowered.plan : null;
}

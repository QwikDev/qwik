/**
 * `generateJsCsr(browserLinkedPlan, options)` — browser modules from the browser LinkedPlan.
 *
 * MOCK STAGE: preconditions enforced, emission lands in slice 2 (against the same fixtures as the
 * SSR slices, browser LinkedPlan).
 */
import { Environment, type LinkedPlan } from '../schema';
import type { GenerateOutput, PresentationOptions } from './output';

export async function generateJsCsr(
  plan: LinkedPlan,
  options: PresentationOptions
): Promise<GenerateOutput> {
  if (plan.specialization.environment !== Environment.Browser) {
    throw new Error('generateJsCsr requires a browser LinkedPlan');
  }
  void options;
  throw new Error('pipeline.generateJsCsr: not implemented yet (slice 2)');
}

/**
 * `generateRustSsr(serverLinkedPlan, entry, options)` — native project sources from the SAME server
 * LinkedPlan `generateJsSsr` consumes. `entry` names which `LinkedPlan.entries` root is packaged,
 * since a LinkedPlan may carry several.
 *
 * MOCK STAGE: preconditions enforced (server env, COMPLETE link, valid entry), emission lands in
 * slice 5. Unsupported linked variants become explicit error arms with stable codes — a
 * server-reachable `js` payload body is a refusal here, never a silent skip.
 */
import { Environment, type LinkedPlan } from '../schema';
import type { GenerateOutput, PresentationOptions } from './output';

export async function generateRustSsr(
  plan: LinkedPlan,
  entry: number,
  options: PresentationOptions
): Promise<GenerateOutput> {
  if (plan.specialization.environment !== Environment.Server) {
    throw new Error('generateRustSsr requires a server LinkedPlan');
  }
  if (!plan.complete) {
    throw new Error('generateRustSsr requires a COMPLETE link');
  }
  if (plan.entries[entry] === undefined) {
    throw new Error(`generateRustSsr: entry ${entry} is not in LinkedPlan.entries`);
  }
  void options;
  throw new Error('pipeline.generateRustSsr: not implemented yet (slice 5)');
}

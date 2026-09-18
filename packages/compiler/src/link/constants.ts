/**
 * Build constants are decided per environment, so the link answers every read a module made. A read
 * the mode cannot decide (`isDev` in a neutral library plan) keeps its source text.
 */
import { foldPredicate, type LinkedModule, type Specialization } from '../schema';

export function foldConstants(modules: LinkedModule[], specialization: Specialization): void {
  const context = { environment: specialization.environment, mode: specialization.mode };
  for (const module of modules) {
    for (const payload of module.payloads) {
      for (const constant of payload.constants) {
        const value = foldPredicate(constant.predicate, context);
        if (value !== null) {
          constant.value = value;
        }
      }
    }
  }
}

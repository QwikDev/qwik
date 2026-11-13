/**
 * Build constants are decided per environment, so the link answers every read a module made. A read
 * the specialization cannot decide (a host constant it does not define) keeps its source text.
 */
import { foldPredicate, type LinkedModule, type Specialization } from '../schema';

export function foldConstants(modules: LinkedModule[], specialization: Specialization): void {
  const context = {
    environment: specialization.environment,
    mode: specialization.mode,
    constants: specialization.constants,
  };
  for (const module of modules) {
    module.payloads = module.payloads.map((payload) =>
      payload.constants.length === 0
        ? payload
        : {
            ...payload,
            constants: payload.constants.map((constant) => {
              const value = foldPredicate(constant.predicate, context);
              return value === null ? constant : { ...constant, value };
            }),
          }
    );
  }
}

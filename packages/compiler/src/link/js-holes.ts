/**
 * A hole is authored JavaScript the plan carries as text. The JS generators paste it back, so it
 * costs them nothing; an engine that is not JavaScript cannot run it at all. Client-only code stays
 * text by design, so only what the server reaches counts.
 */
import { eventScopeName } from '../analyse/events';
import {
  BoundaryKind,
  DiagnosticCategory,
  Environment,
  JsHoles,
  QrlBodyKind,
  SetupKind,
  type Diagnostic,
  type LinkedModule,
  type LinkedQrl,
  type Specialization,
} from '../schema';

/** Boundaries only the browser runs: their bodies never reach a server engine. */
const CLIENT_ONLY_HOOKS = new Set([
  'useVisibleTask$',
  'useOn$',
  'useOnDocument$',
  'useOnWindow$',
  'event$',
]);

export function reportJsHoles(modules: LinkedModule[], specialization: Specialization): void {
  if (
    specialization.jsHoles !== JsHoles.Forbid ||
    specialization.environment !== Environment.Server
  ) {
    return;
  }
  for (const module of modules) {
    for (const qrl of module.qrls) {
      if (qrl.body.b === QrlBodyKind.Js && isServerReachable(qrl)) {
        module.diagnostics.push(hole(`the ${qrl.ctxName} body`, qrl.origin.range));
      }
    }
    for (const program of module.programs) {
      for (const entry of program.setup) {
        if (entry.s === SetupKind.Js) {
          module.diagnostics.push(hole('a setup statement', module.payloads[entry.payload].range));
        }
      }
    }
  }
}

function isServerReachable(qrl: LinkedQrl): boolean {
  if (CLIENT_ONLY_HOOKS.has(qrl.ctxName) || eventScopeName(qrl.ctxName) !== null) {
    return false;
  }
  return qrl.boundary.kind !== BoundaryKind.Implicit || qrl.boundary.role !== 'event';
}

function hole(construct: string, span: Diagnostic['span']): Diagnostic {
  return {
    code: 'js-hole',
    message: `${construct} is carried as JavaScript text, which only a JavaScript engine can run.`,
    span,
    category: DiagnosticCategory.Error,
  };
}

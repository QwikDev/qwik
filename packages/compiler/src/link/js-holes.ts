/**
 * A body the plan carries as JavaScript text rather than IR. A JavaScript engine runs it as happily
 * as anything else, so it says nothing there. A native engine has to fall back to an embedded
 * JavaScript runtime for it, which is slower and less portable, so it is warned about.
 *
 * The author's own answer to a warning is `native$`, which describes the body for that engine.
 */
import {
  BoundaryKind,
  DiagnosticCategory,
  Environment,
  PlanEngine,
  QrlBodyKind,
  SetupKind,
  type Diagnostic,
  type LinkedModule,
  type LinkedQrl,
  type Specialization,
} from '../schema';

/** Roles the server never opens: it writes the symbol into the HTML and the browser runs the body. */
const SERIALIZED_ONLY = new Set(['event', 'prop', 'slot', 'projection']);

/** Markers whose role does not say it: they wrap a handler, so only the browser runs the body. */
const CLIENT_ONLY_HOOKS = new Set([
  'useVisibleTask$',
  'useOn$',
  'useOnDocument$',
  'useOnWindow$',
  'event$',
]);

export function reportJsHoles(modules: LinkedModule[], specialization: Specialization): void {
  if (
    specialization.engine !== PlanEngine.Native ||
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
  // A sync handler exists to run in the browser before anything loads.
  if (qrl.boundary.kind === BoundaryKind.Sync) {
    return false;
  }
  if (qrl.boundary.kind !== BoundaryKind.Implicit) {
    return true;
  }
  return !SERIALIZED_ONLY.has(qrl.boundary.role) && !CLIENT_ONLY_HOOKS.has(qrl.ctxName);
}

function hole(construct: string, span: Diagnostic['span']): Diagnostic {
  return {
    code: 'js-hole',
    message: `${construct} is JavaScript text, so this engine falls back to a JavaScript runtime for it. Describe it with native$ to avoid that.`,
    span,
    category: DiagnosticCategory.Warning,
  };
}

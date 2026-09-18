/**
 * A body the plan carries as JavaScript text rather than IR. A JavaScript engine runs it as happily
 * as anything else, so it says nothing there. A native engine has to fall back to an embedded
 * JavaScript runtime for it, which is slower and less portable, so it is warned about.
 *
 * The author's own answer to a warning is `native$`, which describes the body for that engine.
 */
import {
  BindingScope,
  BoundaryKind,
  DiagnosticCategory,
  Environment,
  PlanEngine,
  QrlBodyKind,
  SetupKind,
  ValueIrKind,
  type Diagnostic,
  type LinkedModule,
  type LinkedQrl,
  type Result,
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
  const invoked = collectInvokedProps(modules);
  for (const module of modules) {
    for (const qrl of module.qrls) {
      if (qrl.body.b === QrlBodyKind.Js && isServerReachable(qrl, invoked)) {
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

function isServerReachable(qrl: LinkedQrl, invoked: ReadonlySet<string>): boolean {
  // A sync handler exists to run in the browser before anything loads.
  if (qrl.boundary.kind === BoundaryKind.Sync) {
    return false;
  }
  if (qrl.boundary.kind !== BoundaryKind.Implicit) {
    return true;
  }
  if (invoked.has(qrl.ctxName)) {
    return true;
  }
  return !SERIALIZED_ONLY.has(qrl.boundary.role) && !CLIENT_ONLY_HOOKS.has(qrl.ctxName);
}

/** `$` props a component calls itself: the server runs those bodies instead of serializing them. */
function collectInvokedProps(modules: LinkedModule[]): ReadonlySet<string> {
  const names = new Set<string>();
  for (const module of modules) {
    for (const invocation of module.invocations ?? []) {
      const name = invokedPropName(module, invocation.callee);
      if (name !== null) {
        names.add(name);
      }
    }
  }
  return names;
}

/** The authored prop key behind a call, whether read off props or destructured, renamed or not. */
function invokedPropName(module: LinkedModule, callee: Result): string | null {
  if (callee.kind === ValueIrKind.Member) {
    return paramBinding(module, callee.obj) === undefined ? null : callee.name;
  }
  if (callee.kind !== ValueIrKind.BindingRead) {
    return null;
  }
  const binding = paramBinding(module, callee);
  if (binding === undefined) {
    return null;
  }
  const source = binding.result?.value;
  const values = source?.kind === 'union-result' ? source.values : [];
  for (const value of values) {
    // a destructured prop may be renamed, so the authored key rides the member it came from
    if (value.kind === ValueIrKind.Member) {
      return value.name;
    }
  }
  return binding.name;
}

function paramBinding(module: LinkedModule, value: Result) {
  if (value.kind !== ValueIrKind.BindingRead) {
    return undefined;
  }
  const binding = findBinding(module, value.binding);
  return binding?.scope === BindingScope.Param ? binding : undefined;
}

function findBinding(module: LinkedModule, id: number) {
  return module.bindings.find((binding) => binding.id === id);
}

function hole(construct: string, span: Diagnostic['span']): Diagnostic {
  return {
    code: 'js-hole',
    message: `${construct} is JavaScript text, so this engine falls back to a JavaScript runtime for it. Describe it with native$ to avoid that.`,
    span,
    category: DiagnosticCategory.Warning,
  };
}

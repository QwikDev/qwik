/**
 * Server-only stripping. The environment being built keeps a listed boundary's identity but not its
 * callback, and keeps a listed export's name but not its body; the server registers by symbol the
 * boundaries it must be able to call without loading a chunk.
 *
 * The names are framework knowledge (Router's `routeLoader$`, `server$`, its route handlers); the
 * matching here is generic prefix matching over the boundary's authored callee.
 */
import {
  AssemblyKind,
  BoundaryKind,
  DeliveryKind,
  ExportKind,
  StripValueForm,
  type LinkedModule,
  type Specialization,
} from '../schema';

/** A boundary a listed prefix claims; only an implicit one has a twin to keep calling. */
function matches(prefixes: readonly string[], ctxName: string): boolean {
  return prefixes.some((prefix) => ctxName.startsWith(prefix));
}

export function applyStripping(modules: LinkedModule[], specialization: Specialization): void {
  const { exports, ctxName, regCtxName } = specialization.strip;
  for (const module of modules) {
    if (ctxName.length > 0) {
      stripBoundaries(module, ctxName);
    }
    if (regCtxName.length > 0) {
      registerBoundaries(module, regCtxName);
    }
    if (exports.length > 0) {
      stripExports(module, exports);
    }
  }
}

/** A stripped boundary ships no chunk, and neither does anything only it could have reached. */
function stripBoundaries(module: LinkedModule, prefixes: readonly string[]): void {
  const stripped = new Set<string>();
  for (const qrl of module.qrls) {
    if (qrl.boundary.kind === BoundaryKind.Implicit && matches(prefixes, qrl.ctxName)) {
      stripped.add(qrl.id);
    }
  }
  if (stripped.size === 0) {
    return;
  }
  // A QRL the stripped body referenced vanishes with it, and so on transitively.
  for (let changed = true; changed; ) {
    changed = false;
    for (const qrl of module.qrls) {
      if (stripped.has(qrl.id) || qrl.declaration !== undefined) {
        continue;
      }
      const owners = module.qrls.filter((owner) => owner.dependencies.qrls.includes(qrl.id));
      if (owners.length > 0 && owners.every((owner) => stripped.has(owner.id))) {
        stripped.add(qrl.id);
        changed = true;
      }
    }
  }
  for (const qrl of module.qrls) {
    if (stripped.has(qrl.id)) {
      qrl.delivery = { d: DeliveryKind.Stripped };
    }
  }
}

/** A registered boundary keeps its implementation and publishes the symbol the server resolves. */
function registerBoundaries(module: LinkedModule, prefixes: readonly string[]): void {
  for (const qrl of module.qrls) {
    if (qrl.boundary.kind === BoundaryKind.Implicit && matches(prefixes, qrl.ctxName)) {
      qrl.delivery = { d: DeliveryKind.Register, symbol: qrl.name };
    }
  }
}

/** A stripped export keeps its name so importers still link; its body becomes a fail-loud stub. */
function stripExports(module: LinkedModule, names: readonly string[]): void {
  for (const entry of module.exports) {
    if (entry.e !== ExportKind.Local || !names.includes(entry.exported)) {
      continue;
    }
    const range = entry.valueRange;
    if (range !== undefined) {
      module.assembly.push({
        a: AssemblyKind.StripValue,
        range,
        form: entry.valueIsBody === true ? StripValueForm.Body : StripValueForm.Initializer,
      });
    }
  }
}

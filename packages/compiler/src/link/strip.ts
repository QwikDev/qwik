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
  Environment,
  ExportKind,
  StripValueForm,
  type EsmEdge,
  type LinkedModule,
  type ModulePlan,
  type Qrl,
  type Specialization,
} from '../schema';
import { QWIK_CORE_IMPORT } from '../words';

/** A boundary a listed prefix claims; only an implicit one has a twin to keep calling. */
function matches(prefixes: readonly string[], ctxName: string): boolean {
  return prefixes.some((prefix) => ctxName.startsWith(prefix));
}

export function applyStripping(modules: LinkedModule[], specialization: Specialization): void {
  const { exports, ctxName, regCtxName } = specialization.strip;
  for (const module of modules) {
    if (ctxName.length > 0) {
      stripBoundaries(module, ctxName, specialization.environment === Environment.Browser);
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
function stripBoundaries(
  module: LinkedModule,
  prefixes: readonly string[],
  pruneDeadImports: boolean
): void {
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
  if (pruneDeadImports) {
    const dead = deadStrippedEdges(
      {
        qrls: module.qrls,
        imports: module.imports.map(({ source }) => source),
        edges: module.edges,
      },
      prefixes
    );
    for (const edge of module.edges) {
      if (dead.has(edge.id)) {
        module.assembly.push({ a: AssemblyKind.StripRange, range: edge.ownerRange });
      }
    }
  }
}

/** What `deadStrippedEdges` needs from a module, before or after linking. */
export interface StrippableSurface {
  qrls: readonly Pick<Qrl, 'boundary' | 'ctxName' | 'origin'>[];
  imports: readonly ModulePlan['imports'][number][];
  edges: readonly EsmEdge[];
}

/**
 * Edges only a stripped boundary's body reads, so this environment must neither resolve nor emit
 * them: a `.server` module the client build merely touches is a hard error there, by design. The
 * server keeps its statements — a module it imports may register a boundary as a side effect.
 */
export function deadStrippedEdges(
  module: StrippableSurface,
  prefixes: readonly string[]
): Set<number> {
  const dead = new Set<number>();
  // A transitively stripped QRL nests inside its owner's body, so matched boundaries cover it.
  const strippedBodies = module.qrls
    .filter((qrl) => qrl.boundary.kind === BoundaryKind.Implicit && matches(prefixes, qrl.ctxName))
    .map((qrl) => qrl.origin.bodyRange);
  if (strippedBodies.length === 0) {
    return dead;
  }
  const isReadOnlyByStrippedBody = (source: ModulePlan['imports'][number]) =>
    source.typeOnly ||
    (source.referenceRanges.length > 0 &&
      source.referenceRanges.every(([start, end]) =>
        strippedBodies.some(([bodyStart, bodyEnd]) => start >= bodyStart && end <= bodyEnd)
      ));
  for (const edge of module.edges) {
    // Core is never server-only, and its statement is where assembly splices the runtime imports.
    if (edge.specifier === QWIK_CORE_IMPORT || edge.ownerRange[0] === edge.ownerRange[1]) {
      continue;
    }
    const specifiers = module.imports.filter((source) => source.edge === edge.id);
    // Partial pruning would only drop a name; the whole statement is what pulls in the module.
    if (specifiers.length > 0 && specifiers.every(isReadOnlyByStrippedBody)) {
      dead.add(edge.id);
    }
  }
  return dead;
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

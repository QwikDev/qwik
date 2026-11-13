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
  BoundaryRole,
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

/**
 * A boundary a listed prefix claims; only an implicit one has a twin to keep calling. A lifted
 * local's ctxName is its own name, not a marker callee.
 */
function matches(prefixes: readonly string[], qrl: Pick<Qrl, 'boundary' | 'ctxName'>): boolean {
  return (
    qrl.boundary.kind === BoundaryKind.Implicit &&
    qrl.boundary.role !== BoundaryRole.Function &&
    prefixes.some((prefix) => qrl.ctxName.startsWith(prefix))
  );
}

export function applyStripping(modules: LinkedModule[], specialization: Specialization): void {
  const { exports, ctxName, regCtxName, eventHandlers = false } = specialization.strip;
  for (const module of modules) {
    if (ctxName.length > 0 || eventHandlers) {
      stripBoundaries(
        module,
        ctxName,
        specialization.environment === Environment.Browser,
        eventHandlers
      );
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
  pruneDeadImports: boolean,
  eventHandlers: boolean
): void {
  const stripped = new Set<string>();
  for (const qrl of module.qrls) {
    if (
      matches(prefixes, qrl) ||
      (eventHandlers &&
        qrl.boundary.kind === BoundaryKind.Implicit &&
        qrl.boundary.role === BoundaryRole.Event)
    ) {
      stripped.add(qrl.id);
    }
  }
  if (stripped.size === 0) {
    return;
  }
  const owners = new Map<string, string[]>();
  for (const owner of module.qrls) {
    for (const id of owner.dependencies.qrls) {
      const referencedBy = owners.get(id);
      if (referencedBy === undefined) {
        owners.set(id, [owner.id]);
      } else {
        referencedBy.push(owner.id);
      }
    }
  }
  // A QRL the stripped body referenced vanishes with it, and so on transitively.
  for (let changed = true; changed; ) {
    changed = false;
    for (const qrl of module.qrls) {
      if (stripped.has(qrl.id) || qrl.declaration !== undefined) {
        continue;
      }
      const referencedBy = owners.get(qrl.id) ?? [];
      if (referencedBy.length > 0 && referencedBy.every((owner) => stripped.has(owner))) {
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
    module.assembly = [
      ...module.assembly,
      ...module.edges
        .filter((edge) => dead.has(edge.id))
        .map((edge) => ({ a: AssemblyKind.StripRange as const, range: edge.ownerRange })),
    ];
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
    .filter((qrl) => matches(prefixes, qrl))
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
    if (matches(prefixes, qrl)) {
      qrl.delivery = { d: DeliveryKind.Register, symbol: qrl.name };
    }
  }
}

/** A stripped export keeps its name so importers still link; its body becomes a fail-loud stub. */
function stripExports(module: LinkedModule, names: readonly string[]): void {
  const stubs = module.exports.flatMap((entry): LinkedModule['assembly'] =>
    entry.e !== ExportKind.Local ||
    !names.includes(entry.exported) ||
    entry.valueRange === undefined
      ? []
      : [
          {
            a: AssemblyKind.StripValue,
            range: entry.valueRange,
            form: entry.valueIsBody === true ? StripValueForm.Body : StripValueForm.Initializer,
          },
        ]
  );
  module.assembly = [...module.assembly, ...stubs];
}

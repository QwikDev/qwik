/**
 * A branch the build decides is not a branch: the surviving arm's operations take its place in the
 * parent, and the condition and the arm that cannot run leave the artifact. The bundler cannot do
 * this, because each arm is its own chunk reached by symbol.
 */
import {
  DeliveryKind,
  foldPredicate,
  OpKind,
  ProgramBodyKind,
  QrlBodyKind,
  type LinkedModule,
  type LinkedOp,
  type LinkedProgram,
  ValueKind,
  type QrlUse,
  type Specialization,
} from '../schema';

export function foldBranches(modules: LinkedModule[], specialization: Specialization): void {
  const context = {
    environment: specialization.environment,
    mode: specialization.mode,
    constants: specialization.constants,
  };
  for (const module of modules) {
    const dropped = new Set<string>();
    for (const program of module.programs) {
      if (program.body.kind === ProgramBodyKind.Ops) {
        program.body.ops = foldOps(module, program.body.ops, context, dropped);
      }
    }
    if (dropped.size === 0) {
      continue;
    }
    for (const qrl of module.qrls) {
      if (dropped.has(qrl.id)) {
        qrl.delivery = { d: DeliveryKind.Omit };
      }
    }
  }
}

function foldOps(
  module: LinkedModule,
  ops: LinkedOp[],
  context: Parameters<typeof foldPredicate>[1],
  dropped: Set<string>
): LinkedOp[] {
  return ops.flatMap((op): LinkedOp[] => {
    if (op.op === OpKind.Element) {
      op.children = foldOps(module, op.children, context, dropped);
      return [op];
    }
    if (op.op !== OpKind.Branch || op.predicate === undefined) {
      return [op];
    }
    const taken = foldPredicate(op.predicate, context);
    if (taken === null) {
      return [op];
    }
    const kept = taken ? op.then : op.else;
    const lost = taken ? op.else : op.then;
    if (op.condition.v === ValueKind.Qrl) {
      dropQrl(module, op.condition.use.qrl, dropped);
    }
    if (lost !== null) {
      dropQrl(module, lost.qrl, dropped);
    }
    if (kept === null) {
      return [];
    }
    const arm = armProgram(module, kept);
    if (arm === null) {
      return [op];
    }
    dropped.add(kept.qrl);
    return arm.body.kind === ProgramBodyKind.Ops ? arm.body.ops : [op];
  });
}

/** The arm's own program, when it is one: an expression arm keeps its chunk. */
function armProgram(module: LinkedModule, use: QrlUse): LinkedProgram | null {
  const qrl = module.qrls.find((entry) => entry.id === use.qrl);
  if (qrl === undefined || qrl.body.b !== QrlBodyKind.Program) {
    return null;
  }
  return module.programs[qrl.body.program] ?? null;
}

/** A dropped boundary takes with it whatever only it could reach. */
function dropQrl(module: LinkedModule, id: string, dropped: Set<string>): void {
  if (dropped.has(id)) {
    return;
  }
  dropped.add(id);
  const qrl = module.qrls.find((entry) => entry.id === id);
  for (const nested of qrl?.dependencies.qrls ?? []) {
    dropQrl(module, nested, dropped);
  }
}

import {
  ArgPass,
  ExprKind,
  OpKind,
  ProgramBodyKind,
  PropKind,
  ResumeKind,
  Shape,
  ValueKind,
  type LinkedModule,
  type LinkedOp,
  type Prop,
  type Value,
} from '../schema';
import { ValueIrKind as Ir } from '../schema/value-ir';
import { assertNever } from '../errors';
import { childOps, mapChildOps } from '../op-tree';

type ScalarOperation =
  | Extract<LinkedOp, { op: OpKind.Hole }>
  | Extract<Prop, { k: PropKind.Dynamic }>;

/** Group consecutive scalar computations without crossing rendered program boundaries. */
export function linkEffects(module: LinkedModule): void {
  module.programs = module.programs.map((program) => {
    if (program.body.kind !== ProgramBodyKind.Ops) {
      return program;
    }
    const effects = batchEffects(program.body.ops);
    if (effects.size === 0) {
      return program;
    }
    const effectSizes: number[] = [];
    for (const effect of effects.values()) {
      effectSizes[effect] = (effectSizes[effect] ?? 0) + 1;
    }
    return {
      ...program,
      body: {
        kind: ProgramBodyKind.Ops,
        ops: program.body.ops.map((op) => withEffects(op, effects)),
      },
      effectSizes,
    };
  });
}

function batchEffects(ops: LinkedOp[]): Map<ScalarOperation, number> {
  const effects = new Map<ScalarOperation, number>();
  let next = 0;
  let pending: ScalarOperation[] = [];
  let key: string | null = null;
  const finish = () => {
    if (pending.length >= 2) {
      for (const operation of pending) {
        effects.set(operation, next);
      }
      next++;
    }
    pending = [];
    key = null;
  };
  const append = (operation: ScalarOperation) => {
    const dependencies = dependencyKey(operation.value);
    if (dependencies === null || dependencies !== key) {
      finish();
    }
    if (dependencies !== null) {
      key = dependencies;
      pending.push(operation);
    }
  };
  const visit = (children: readonly LinkedOp[]) => {
    for (const op of children) {
      if (op.op === OpKind.Element) {
        if (op.propsEffect !== null) {
          finish();
        }
        for (const prop of op.props) {
          switch (prop.k) {
            case PropKind.Dynamic:
              append(prop);
              break;
            case PropKind.Spread:
            case PropKind.InnerHtml:
              finish();
              break;
            case PropKind.Static:
            case PropKind.Event:
            case PropKind.Ref:
              break;
            default:
              assertNever(prop, 'prop');
          }
        }
      } else if (op.op === OpKind.Hole && op.shape === Shape.Text) {
        append(op);
      } else if (op.op !== OpKind.Static) {
        finish();
      }
      visit(childOps(op));
    }
  };
  visit(ops);
  finish();
  return effects;
}

/** The plan's ops are shared with other links, so a batched operation is copied, not assigned. */
function withEffects(op: LinkedOp, effects: ReadonlyMap<object, number>): LinkedOp {
  if (op.op === OpKind.Hole && effects.has(op)) {
    return { ...op, effect: effects.get(op)! };
  }
  const linked = mapChildOps(op, (child) => withEffects(child, effects));
  if (linked.op === OpKind.Element) {
    linked.props = linked.props.map((prop) =>
      effects.has(prop) ? { ...prop, effect: effects.get(prop)! } : prop
    );
  }
  return linked;
}

function dependencyKey(value: Value): string | null {
  if (value.v === ValueKind.Computed && value.resume.r === ResumeKind.Qrl) {
    return value.resume.qrl.args.length === 0
      ? null
      : JSON.stringify(
          [...new Set(value.resume.qrl.args.map((argument) => JSON.stringify(argument)))].sort()
        );
  }
  if (value.v !== ValueKind.Read || value.expr.kind !== ExprKind.Ir) {
    return null;
  }
  let expression = value.expr.ir;
  while (expression.kind === Ir.Member) {
    expression = expression.obj;
  }
  switch (expression.kind) {
    case Ir.BindingRead:
    case Ir.SignalRead:
    case Ir.StoreRead:
    case Ir.PropRead:
      return JSON.stringify([
        JSON.stringify({ pass: ArgPass.Binding, binding: expression.binding }),
      ]);
    default:
      return null;
  }
}

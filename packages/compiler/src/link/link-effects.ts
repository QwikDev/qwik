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
      body: { kind: ProgramBodyKind.Ops, ops: withEffects(program.body.ops, effects) },
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
  const visit = (children: LinkedOp[]) => {
    for (const op of children) {
      if (op.op === OpKind.Element) {
        if (op.propsEffect !== null) {
          finish();
        }
        for (const prop of op.props) {
          if (prop.k === PropKind.Dynamic) {
            append(prop);
          } else if (prop.k === PropKind.Spread || prop.k === PropKind.InnerHtml) {
            finish();
          }
        }
        visit(op.children);
      } else if (op.op === OpKind.Hole && op.shape === Shape.Text) {
        append(op);
      } else if (op.op !== OpKind.Static) {
        finish();
      }
    }
  };
  visit(ops);
  finish();
  return effects;
}

/** The plan's ops are shared with other links, so a batched operation is copied, not assigned. */
function withEffects(ops: LinkedOp[], effects: ReadonlyMap<object, number>): LinkedOp[] {
  return ops.map((op) => {
    if (op.op === OpKind.Element) {
      return {
        ...op,
        props: op.props.map((prop) =>
          effects.has(prop) ? { ...prop, effect: effects.get(prop)! } : prop
        ),
        children: withEffects(op.children, effects),
      };
    }
    return effects.has(op) ? { ...op, effect: effects.get(op)! } : op;
  });
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

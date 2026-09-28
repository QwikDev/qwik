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

export function effectCounts(ops: LinkedOp[]): Map<number, number> {
  const counts = new Map<number, number>();
  const count = (operation: ScalarOperation) => {
    if (operation.effect !== null) {
      counts.set(operation.effect, (counts.get(operation.effect) ?? 0) + 1);
    }
  };
  const visit = (children: LinkedOp[]) => {
    for (const op of children) {
      if (op.op === OpKind.Element) {
        for (const prop of op.props) {
          if (prop.k === PropKind.Dynamic) {
            count(prop);
          }
        }
        visit(op.children);
      } else if (op.op === OpKind.Hole) {
        count(op);
      }
    }
  };
  visit(ops);
  return counts;
}

/** Group consecutive scalar computations without crossing rendered program boundaries. */
export function linkEffects(module: LinkedModule): void {
  for (const program of module.programs) {
    if (program.body.kind !== ProgramBodyKind.Ops) {
      continue;
    }
    let next = 0;
    let pending: ScalarOperation[] = [];
    let key: string | null = null;
    const finish = () => {
      if (pending.length >= 2) {
        for (const operation of pending) {
          operation.effect = next;
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
    const visit = (ops: LinkedOp[]) => {
      for (const op of ops) {
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
    visit(program.body.ops);
    finish();
  }
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

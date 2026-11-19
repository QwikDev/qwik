/** The one definition of which render ops nest other ops, for analysis and linked trees alike. */
import { assertNever } from './errors';
import { OpKind, type LinkedOp, type Op } from './schema';

type TreeOp = Op | LinkedOp;
type ChildOp<T extends TreeOp> = T extends { children: readonly (infer Child)[] } ? Child : never;
type WithChildOps<T extends TreeOp, Child> = T extends { children: readonly unknown[] }
  ? Omit<T, 'children'> & { children: Child[] }
  : T;

const noChildOps: readonly never[] = [];

/**
 * The ops nested directly in `op`, in document order. Ops behind a QRL or a program id are not
 * children: they are other programs.
 */
export function childOps<T extends TreeOp>(op: T): readonly ChildOp<T>[] {
  const node: TreeOp = op;
  switch (node.op) {
    case OpKind.Element:
      return node.children as ChildOp<T>[];
    case OpKind.Static:
    case OpKind.Hole:
    case OpKind.Component:
    case OpKind.Branch:
    case OpKind.Each:
    case OpKind.Slot:
    case OpKind.Content:
    case OpKind.Pending:
    case OpKind.Catch:
      return noChildOps;
    default:
      return assertNever(node, 'op');
  }
}

/**
 * `op` with its child ops mapped in order; a parent is always copied, since later passes assign
 * into it.
 */
export function mapChildOps<T extends TreeOp, Child>(
  op: T,
  map: (child: ChildOp<T>) => Child
): WithChildOps<T, Child> {
  const node: TreeOp = op;
  switch (node.op) {
    case OpKind.Element:
      return { ...node, children: childOps(op).map(map) } as WithChildOps<T, Child>;
    case OpKind.Static:
    case OpKind.Hole:
    case OpKind.Component:
    case OpKind.Branch:
    case OpKind.Each:
    case OpKind.Slot:
    case OpKind.Content:
    case OpKind.Pending:
    case OpKind.Catch:
      return op as WithChildOps<T, Child>;
    default:
      return assertNever(node, 'op');
  }
}

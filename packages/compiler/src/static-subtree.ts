/** Static-subtree facts shared by the analyser's checks and the generators' folding. */
import {
  ExprKind,
  OpKind,
  PropKind,
  ResumeKind,
  ValueKind,
  type LinkedOp,
  type Op,
  type Value,
} from './schema';
import { ValueIrKind } from './schema/value-ir';

/** The string an inline value always evaluates to, when it is a plain literal. */
export function inlineStringValue(value: Value): string | null {
  const ir =
    value.v === ValueKind.Computed &&
    value.resume.r === ResumeKind.Inline &&
    value.expr.kind === ExprKind.Ir
      ? value.expr.ir
      : null;
  return ir?.kind === ValueIrKind.Lit && typeof ir.value === 'string' ? ir.value : null;
}

/** True when the whole subtree folds to markup — no dynamic props, holes, or effects. */
export function isFullyStaticSubtree(op: Op | LinkedOp): boolean {
  if (op.op === OpKind.Static) {
    return true;
  }
  if (op.op !== OpKind.Element) {
    return false;
  }
  const innerHtml = op.props.find((prop) => prop.k === PropKind.InnerHtml);
  return (
    op.propsEffect === null &&
    op.props.every((prop) => prop.k === PropKind.Static || prop === innerHtml) &&
    (innerHtml !== undefined
      ? inlineStringValue(innerHtml.value) !== null
      : op.children.every(isFullyStaticSubtree))
  );
}

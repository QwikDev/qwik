import { OpKind, PropKind, type Op } from '../schema';
import { escapeAttr, escapeText, serializeAttrValue } from '../html';
import { UnsupportedError } from '../errors';

/**
 * Folds a fully static op tree to markup. Attribute bytes are identical everywhere; TEXT differs
 * per target: SSR streams it raw, CSR template markup escapes it.
 */
export function foldStaticOp(op: Op, escapeTextContent: boolean): string {
  switch (op.op) {
    case OpKind.Static:
      return escapeTextContent ? escapeText(op.html) : op.html;
    case OpKind.Element: {
      let html = `<${op.tag}`;
      for (const prop of op.props) {
        if (prop.k !== PropKind.Static) {
          throw new UnsupportedError(`folding the non-static prop "${prop.k}"`);
        }
        const serialized = serializeAttrValue(prop.name, prop.value ?? null);
        if (serialized === null) {
          continue;
        }
        html += serialized === '' ? ` ${prop.name}` : ` ${prop.name}="${escapeAttr(serialized)}"`;
      }
      html += '>';
      if (op.void) {
        return html;
      }
      for (const child of op.children) {
        html += foldStaticOp(child, escapeTextContent);
      }
      return `${html}</${op.tag}>`;
    }
    default:
      throw new UnsupportedError(`folding the op "${op.op}"`);
  }
}

/** True when the whole subtree folds to markup — no dynamic props, holes, or effects. */
export function isFullyStaticSubtree(op: Op): boolean {
  if (op.op === OpKind.Static) {
    return true;
  }
  if (op.op !== OpKind.Element) {
    return false;
  }
  return (
    op.props.every((prop) => prop.k === PropKind.Static) && op.children.every(isFullyStaticSubtree)
  );
}

import { OpKind, PropKind, type LinkedOp, type Op } from '../schema';
import { escapeAttr, serializeAttrValue } from '../html';
import { UnsupportedError } from '../errors';
import { inlineStringValue } from './emit-chunk';

/** Folds a fully static op tree to markup; static text is already HTML, so both targets share it. */
export function foldStaticOp(op: Op | LinkedOp): string {
  switch (op.op) {
    case OpKind.Static:
      return op.html;
    case OpKind.Element: {
      if (op.propsEffect !== null) {
        throw new UnsupportedError('folding an element with runtime props');
      }
      let html = `<${op.tag}`;
      let innerHtml: string | null = null;
      for (const prop of op.props) {
        if (prop.k === PropKind.InnerHtml) {
          innerHtml = inlineStringValue(prop.value);
          if (innerHtml === null) {
            throw new UnsupportedError('folding a live innerHTML');
          }
          continue;
        }
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
      // Literal innerHTML is the content as written, never escaped like text.
      if (innerHtml !== null) {
        return `${html}${innerHtml}</${op.tag}>`;
      }
      for (const child of op.children) {
        html += foldStaticOp(child);
      }
      return `${html}</${op.tag}>`;
    }
    default:
      throw new UnsupportedError(`folding the op "${op.op}"`);
  }
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

import type { JSXOutput, _ElementVNode, _QDocument, _VirtualVNode } from '@qwik.dev/core';
import {
  vnode_applyJournal,
  vnode_getFirstChild,
  vnode_getParent,
  vnode_insertBefore,
  vnode_newText,
  vnode_newUnMaterializedElement,
  vnode_setAttr,
  type VNodeJournal,
} from './client/vnode';
import { createDocument } from '../testing/document';
import { walkJSX } from '../testing/vdom-diff.unit-util';

/** @public */

export function vnode_fromJSX(jsx: JSXOutput) {
  const doc = createDocument() as _QDocument;
  doc.qVNodeData = new WeakMap();
  const vBody = vnode_newUnMaterializedElement(doc.body);
  let vParent: _ElementVNode | _VirtualVNode = vBody;
  const journal: VNodeJournal = [];
  walkJSX(jsx, {
    enter: (jsx) => {
      const type = jsx.type;
      if (typeof type === 'string') {
        const child = vnode_newUnMaterializedElement(doc.createElement(type));
        vnode_insertBefore(journal, vParent, child, null);

        // TODO(hack): jsx.props is an empty object
        const props = jsx.varProps;
        for (const key in props) {
          if (Object.prototype.hasOwnProperty.call(props, key)) {
            vnode_setAttr(journal, child, key, String(props[key]));
          }
        }
        if (jsx.key != null) {
          vnode_setAttr(journal, child, 'q:key', String(jsx.key));
        }
        vParent = child;
      } else {
        throw new Error('Unknown type:' + type);
      }
    },
    leave: () => {
      vParent = vnode_getParent(vParent) as any;
    },
    text: (value) => {
      vnode_insertBefore(
        journal,
        vParent,
        vnode_newText(doc.createTextNode(String(value)), String(value)),
        null
      );
    },
  });
  vnode_applyJournal(journal);
  return { vParent, vNode: vnode_getFirstChild(vParent), document: doc };
}

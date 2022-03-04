import { EMPTY_ARRAY } from '../../util/flyweight';
import type { FunctionComponent, JSXNode } from './types/jsx-node';
import type { QwikJSX } from './types/jsx-qwik';
import { qDev } from '../../util/qdev';
import { Host } from './host.public';

/**
 * @public
 */
export function jsx<T extends string | FunctionComponent<PROPS>, PROPS>(
  type: T,
  props: PROPS,
  key?: string
): JSXNode<T> {
  return processNode(new JSXNodeImpl(type, props, key)) as any;
}

export class JSXNodeImpl<T> implements JSXNode<T> {
  children: JSXNode[] | undefined;
  text?: string | undefined = undefined;

  constructor(public type: T, public props: any, public key: any) {
    if (props) {
      const children = processNode(props.children);
      if (children !== undefined) {
        if (Array.isArray(children)) {
          this.children = children;
        } else {
          this.children = [children];
        }
      }
    }
  }
}

function processNode(node: any): JSXNode[] | JSXNode | undefined {
  if (node == null) {
    return undefined;
  }
  if (isJSXNode(node)) {
    if (node.type === Host) {
      return node;
    } else if (typeof node.type === 'function') {
      return processNode(node.type(node.props, node.children, node.key));
    } else {
      return node;
    }
  } else if (Array.isArray(node)) {
    return node.flatMap(processNode).filter(e => e != null) as JSXNode[];
  } else if (typeof node === 'string' || typeof node === 'number'  || typeof node === 'boolean') {
    const newNode = new JSXNodeImpl('#text', null, null);
    newNode.text = String(node);
    return newNode;
  } else {
    console.warn('Unvalid node, skipping');
    return undefined;
  }
}

export const isJSXNode = (n: any): n is JSXNode<unknown> => {
  if (qDev) {
    if (n instanceof JSXNodeImpl) {
      return true;
    }
    if (n && typeof n === 'object' && n.constructor.name === JSXNodeImpl.name) {
      throw new Error(`Duplicate implementations of "JSXNodeImpl" found`);
    }
    return false;
  } else {
    return n instanceof JSXNodeImpl;
  }
};

/**
 * @public
 */
export const Fragment: FunctionComponent = (_: any, children: any) => children as any;

export type { QwikJSX as JSX };

export { jsx as jsxs, jsx as jsxDEV };

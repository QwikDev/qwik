import type { FunctionComponent, JSXNode } from './types/jsx-node';
import type { QwikJSX } from './types/jsx-qwik';
import { qDev } from '../../util/qdev';
import { Host, SkipRerender } from './host.public';
import { EMPTY_ARRAY } from '../../util/flyweight';
import { logWarn } from '../../util/log';

/**
 * @public
 */
export function jsx<T extends string | FunctionComponent<PROPS>, PROPS>(
  type: T,
  props: PROPS,
  key?: string | number
): JSXNode<T> {
  return new JSXNodeImpl(type, props, key) as any;
}

export class JSXNodeImpl<T> implements JSXNode<T> {
  children: JSXNode[] = EMPTY_ARRAY;
  text?: string | undefined = undefined;
  key: string | null = null;

  constructor(
    public type: T,
    public props: Record<string, any> | null,
    key: string | number | null = null
  ) {
    if (key != null) {
      this.key = String(key);
    }
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

export function processNode(node: any): JSXNode[] | JSXNode | undefined {
  if (node == null || typeof node === 'boolean') {
    return undefined;
  }
  if (isJSXNode(node)) {
    if (node.type === Host || node.type === SkipRerender) {
      return node;
    } else if (typeof node.type === 'function') {
      return processNode(node.type({ ...node.props, children: node.children }, node.key));
    } else {
      return node;
    }
  } else if (Array.isArray(node)) {
    return node.flatMap(processNode).filter((e) => e != null) as JSXNode[];
  } else if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') {
    const newNode = new JSXNodeImpl('#text', null, null);
    newNode.text = String(node);
    return newNode;
  } else {
    logWarn('Unvalid node, skipping');
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
export const Comment: FunctionComponent<{ text?: string }> = (props) => {
  const newNode = new JSXNodeImpl('#comment', null, null);
  newNode.text = props.text || '';
  return newNode;
};

/**
 * @public
 */
export const Fragment: FunctionComponent<{ children?: any }> = (props) => props.children as any;

export type { QwikJSX as JSX };

export { jsx as jsxs, jsx as jsxDEV };

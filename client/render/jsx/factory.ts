/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { EMPTY_OBJ } from '../../util/flyweight.js';
import { QRL } from '../../import/qrl.js';
import { Props } from '../../component/types.js';
import { JSXFactory, JSXNode } from './types.js';

class JSXNode_<T extends string | null | JSXFactory | unknown> {
  public tag: T;
  public props: Props;
  public children: Array<any>;

  constructor(tag: T, props: Props | null, children: Array<string | JSXNode_<unknown>>) {
    this.tag = tag;
    this.props = props || EMPTY_OBJ;
    this.children = children;
  }
}

export function isJSXNode(node: any): node is JSXNode<unknown> {
  return node instanceof JSXNode_;
}

export function jsxFactory<T extends string | null | JSXFactory | unknown>(
  tag: T,
  props: Props,
  ...children: any[]
): JSXNode<T> {
  return new JSXNode_(tag, props, children);
}

export function jsxDeclareComponent<P>(tagName: string, renderUrl: QRL) {
  return function (props: P): JSXNode<string> {
    // TODO[efficiency]: patching `$` is not most efficient.
    return jsxFactory(tagName, { ...props, $: { '::': renderUrl } as any });
  };
}

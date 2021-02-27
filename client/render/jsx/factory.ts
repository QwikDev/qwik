/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { EMPTY_OBJ } from '../../util/flyweight.js';
import { QRL } from '../../import/qrl.js';

export interface QProps {
  [key: string]: string;
}

export interface JSXProps {
  // $: QProps;
  [key: string]: string | boolean | number | null | undefined;
}

export class JSXNode<T extends string | null | JSXFactory | unknown> {
  public tag: T;
  public props: JSXProps;
  public children: Array<any>;

  constructor(tag: T, props: JSXProps | null, children: Array<string | JSXNode<unknown>>) {
    this.tag = tag;
    this.props = props || EMPTY_OBJ;
    this.children = children;
  }
}

export function isJSXNode(node: any): node is JSXNode<unknown> {
  return node instanceof JSXNode;
}

export type JSXFactory = (props: JSXProps) => JSXNode<unknown>;

export function jsxFactory<T extends string | null | JSXFactory | unknown>(
  tag: T,
  props: JSXProps,
  ...children: any[]
): JSXNode<T> {
  return new JSXNode(tag, props, children);
}

export function jsxDeclareComponent<T>(tagName: string, renderUrl: QRL) {
  return function (props: T) {
    // TODO[efficiency]: patching `$` is not most efficient.
    return jsxFactory(tagName, { ...props, $: { '::': renderUrl } as any });
  };
}

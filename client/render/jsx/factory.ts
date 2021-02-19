/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

export interface JSXProps {
  [key: string]: string;
}

export class JSXNode {
  public tag: string|null|JSXFactory;
  public props: JSXProps|null;
  public children: Array<any>;

  constructor(
      tag: string|null|JSXFactory,
      props: JSXProps|null,
      children: Array<string|JSXNode>,
  ) {
    this.tag = tag;
    this.props = props;
    this.children = children;
  }
}

export function isJSXNode(node: any): node is JSXNode {
  return node instanceof JSXNode;
}

export interface JSXFactory {}

export function qJSX(
    tag: string|null|JSXFactory, props: JSXProps|null,
    ...children: any[]): JSXNode {
  return new JSXNode(tag, props, children);
}

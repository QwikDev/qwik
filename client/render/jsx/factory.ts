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

export interface JSXNode {
  tag: string|null|JSXFactory;
  props: JSXProps|null;
  children: Array<string|JSXNode>;
}

export interface JSXFactory {}

export function qJSX(
    tag: string|null|JSXFactory, props: JSXProps|null,
    ...children: (string|JSXNode)[]): JSXNode {
  return {tag, props, children};
}

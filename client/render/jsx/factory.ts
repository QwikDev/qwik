/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

export interface JSXProps {}

export interface JSXNode {}

export function qJSX(
    tag: string|null, props: JSXProps|null,
    ...childrend: (string|JSXNode)[]): JSXNode {
  return {};
}

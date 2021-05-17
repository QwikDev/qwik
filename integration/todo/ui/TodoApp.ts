/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { jsxDeclareComponent, QRL } from '../qoot.js';

export interface ToDoAppProps {}

// TODO(docs): Add explanation why code above is same as comment.
// <div decl:template="ui:/ToDoApp_template">
export const ToDoApp = jsxDeclareComponent<ToDoAppProps>(QRL`ui:/ToDoApp_template`);
/**
export function ToDoApp2(props: Record<any, any>) {
  return <div decl:template="ui:/ToDoApp_template" />;
}
 */

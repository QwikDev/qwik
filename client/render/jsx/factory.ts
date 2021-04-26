/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { EMPTY_OBJ } from '../../util/flyweight.js';
import { QRL } from '../../import/qrl.js';
import { Props } from '../../injector/types.js';
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

/**
 * Factory function used by the TSX.
 *
 * ```
 * return <div></div>;
 * ```
 *
 * gets translated to
 * ```
 * return jsxFactory('div', {});
 * ```
 *
 * By TypeScript
 *
 *
 * @param tag - Tag name (or another function producing JSX)
 * @param props - Properties of the JSX node
 * @param children - Children of the JSX node
 * @returns `JSXNode`
 * @public
 */
export function jsxFactory<T extends string | null | JSXFactory | unknown>(
  tag: T,
  props: Props,
  ...children: any[]
): JSXNode<T> {
  return new JSXNode_(tag, props, children.flat(99));
}

/**
 * Declares a JSX Qoot component.
 *
 * For lazy loading it is important that a top-level component does not have direct reference to
 * a child component. Doing so would pull in tho child component and prevent the child component
 * to be lazy loaded (it would be eagerly loaded with the parent.) For this reason the JSX needs
 * to contain boundaries which demarcate where the components are so that lazy loading can happen.
 *
 * ```
 * <div>
 *   parent component
 *   <child ::="./path_to_child_component_render_function" />
 * </div>
 * ```
 *
 * `::` attributes provides information to the rendering system how to descend to the child
 * component.
 *
 * Writing the above code would be cumbersome because the user of component would have to know
 * what the component QRL is. This would make it hard to change the URL in future refactorings.
 * It would also make it hard to guarantee type safety.
 *
 * For this reason `jsxDeclareComponent` provides a facade for the component host element.
 * ```
 * export const Child = jsxDeclareComponent<HeaderProps>(
 *    QRL`path_to_render_function`,  // value of the '::' attribute
 *    'child'                        // Optional (defaults to 'div') name of the host element
 * );
 * ```
 * With the above code it is not possible to rewrite the example in a more natural format.
 *
 * ```
 * <div>
 *   parent component
 *   <Child />
 * </div>
 * ```
 *
 * @param tagName - Host element tag name.
 * @param renderQrl - QRL pointing to the component's render function.
 * @param hostProps - Optional additional properties which should be included on the host element.
 * @returns
 * @public
 */
export function jsxDeclareComponent<P>(
  renderQrl: QRL,
  tagName: string = 'div',
  hostProps?: { [property: string]: string | QRL }
) {
  return function (props: P): JSXNode<string> {
    // TODO[efficiency]: patching `$` is not most efficient.
    return jsxFactory(tagName, { ...(hostProps as any), ...props, $: { '::': renderQrl } as any });
  };
}

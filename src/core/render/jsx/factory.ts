/* eslint-disable */
/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import type { QRL } from '../../import/qrl';
import { AttributeMarker } from '../../util/markers';
import { EMPTY_ARRAY } from '../../util/flyweight';
import type { FunctionComponent, JSXNode, JSXInternal } from './types';
import { JSXNodeImpl } from './jsx-runtime';
import { flattenArray } from '../../util/array';

/**
 * @public
 */
export function h(type: string | FunctionComponent, props: any, ...children: any[]) {
  // Using legacy h() jsx transform and morphing it
  // so it can use the modern vdom structure
  // https://reactjs.org/blog/2020/09/22/introducing-the-new-jsx-transform.html
  // https://www.typescriptlang.org/tsconfig#jsxImportSource

  const normalizedProps: any = {
    children: arguments.length > 2 ? flattenArray(children) : EMPTY_ARRAY,
  };

  let key: any;
  let i: any;

  for (i in props) {
    if (i == 'key') key = props[i];
    else normalizedProps[i] = props[i];
  }

  return new JSXNodeImpl(type, normalizedProps, key);
}

/**
 * @public
 */
export declare namespace h {
  export function h(type: any): JSXNode<any>;
  export function h(type: Node, data: any): JSXNode<any>;
  export function h(type: any, text: string): JSXNode<any>;
  export function h(type: any, children: Array<any>): JSXNode<any>;
  export function h(type: any, data: any, text: string): JSXNode<any>;
  export function h(
    type: any,
    data: any,
    children: Array<JSXNode<any> | undefined | null>
  ): JSXNode<any>;
  export function h(sel: any, data: any | null, children: JSXNode<any>): JSXNode<any>;

  export namespace JSX {
    interface IntrinsicElements extends JSXInternal.IntrinsicElements {
      [tagName: string]: any;
    }
  }
}

const slice = EMPTY_ARRAY.slice;

/**
 * Declares a JSX Qwik component.
 *
 * For lazy loading it is important that a top-level component does not have direct reference to
 * a child component. Doing so would pull in tho child component and prevent the child component
 * to be lazy loaded (it would be eagerly loaded with the parent.) For this reason the JSX needs
 * to contain boundaries which demarcate where the components are so that lazy loading can happen.
 *
 * ```
 * <div>
 *   parent component
 *   <child decl:template="./path_to_child_component_render_function" />
 * </div>
 * ```
 *
 * The `decl:template` attribute provides information to the rendering system how to descend to the
 * child component.
 *
 * Writing the above code would be cumbersome because the user of component would have to know
 * what the component QRL is. This would make it hard to change the URL in future refactorings.
 * It would also make it hard to guarantee type safety.
 *
 * For this reason `jsxDeclareComponent` provides a facade for the component host element.
 *
 * ```
 * export const Child = jsxDeclareComponent<HeaderProps>(
 *    QRL`path_to_render_function`,  // value of the '::' attribute
 *    'child'                        // Optional (defaults to 'div') name of the host element
 * );
 * ```
 *
 * With the above code it is now possible to rewrite the example in a more natural format.
 *
 * ```
 * <div>
 *   parent component
 *   <Child />
 * </div>
 * ```
 *
 * @param componentTemplateQrl - QRL pointing to the component's render function.
 * @param tagName - Host element tag name.
 * @param hostProps - Optional additional properties which should be included on the host element.
 * @returns
 * @public
 */
export function jsxDeclareComponent<P>(
  componentTemplateQrl: QRL,
  tagName: string = 'div',
  hostProps?: { [property: string]: string | QRL }
) {
  return function (props: P & any): JSXNode<string> {
    return h(tagName, {
      [AttributeMarker.ComponentTemplate]: componentTemplateQrl,
      ...(hostProps as any),
      ...props,
    }) as any;
  };
}

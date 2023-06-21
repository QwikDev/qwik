import type { DOMAttributes, Ref } from './jsx-qwik-attributes';
import type { JSXNode } from './jsx-node';
import type { QwikIntrinsicAttributes, QwikIntrinsicElements } from './jsx-qwik-elements';

type AddRef<T> = {
  [P in keyof T]: T[P] & { ref?: Ref };
};

/**
 * @public
 */
export namespace QwikJSX {
  export interface Element extends JSXNode {}

  export interface IntrinsicAttributes extends QwikIntrinsicAttributes {}
  export interface ElementChildrenAttribute {
    children: any;
  }
  export interface IntrinsicElements extends AddRef<QwikIntrinsicElements> {}
}

/**
 * @public
 */
export interface QwikDOMAttributes extends DOMAttributes<Element> {}

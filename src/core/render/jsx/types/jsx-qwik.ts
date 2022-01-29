import type { DOMAttributes } from './jsx-qwik-attributes';
import type { JSXNode } from './jsx-node';
import type { QwikIntrinsicElements } from './jsx-qwik-elements';

/**
 * @public
 */
export namespace QwikJSX {
  export interface Element extends JSXNode<any> {}
  export interface IntrinsicAttributes {
    [key: string]: any;
  }
  export interface ElementChildrenAttribute {
    children: any;
  }
  export interface IntrinsicElements extends QwikIntrinsicElements {}
}

/**
 * @public
 */
export interface QwikDOMAttributes extends DOMAttributes<any> {}

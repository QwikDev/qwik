import type { DOMAttributes } from './jsx-qwik-attributes';
import type { JSXNode } from './jsx-node';
import type { QwikIntrinsicAttributes, QwikIntrinsicElements } from './jsx-qwik-elements';

/**
 * @public
 */
export namespace QwikJSX {
  export interface Element extends JSXNode {}

  export interface IntrinsicAttributes extends QwikIntrinsicAttributes {}
  export interface ElementChildrenAttribute {
    children: any;
  }
  export interface IntrinsicElements extends QwikIntrinsicElements {}
}

/**
 * @public
 */
export interface QwikDOMAttributes extends DOMAttributes<any> {}

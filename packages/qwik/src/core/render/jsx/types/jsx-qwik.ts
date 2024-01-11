import type { DOMAttributes } from './jsx-qwik-attributes';
import type { FunctionComponent, JSXNode } from './jsx-node';
import type { QwikIntrinsicAttributes, LenientQwikElements } from './jsx-qwik-elements';

/** @public */
export namespace QwikJSX {
  export interface Element extends JSXNode {}
  export type ElementType = string | FunctionComponent;

  export interface IntrinsicAttributes extends QwikIntrinsicAttributes {}
  export interface ElementChildrenAttribute {
    children: any;
  }
  export interface IntrinsicElements extends LenientQwikElements {}
}
/** @public */
export interface QwikDOMAttributes extends DOMAttributes<Element> {}

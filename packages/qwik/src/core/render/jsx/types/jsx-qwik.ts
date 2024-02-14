import type { DOMAttributes, JSXChildren } from './jsx-qwik-attributes';
import type { FunctionComponent, JSXOutput } from './jsx-node';
import type { QwikIntrinsicAttributes, LenientQwikElements } from './jsx-qwik-elements';

/** @public */
export namespace QwikJSX {
  export type Element = JSXOutput;
  export type ElementType = string | FunctionComponent<Record<any, any>>;

  export interface IntrinsicAttributes extends QwikIntrinsicAttributes {}
  export interface ElementChildrenAttribute {
    children: JSXChildren;
  }
  export interface IntrinsicElements extends LenientQwikElements {}
}
/** @public */
export interface QwikDOMAttributes extends DOMAttributes<Element> {}

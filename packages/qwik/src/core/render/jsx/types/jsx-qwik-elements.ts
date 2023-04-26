import type {
  HTMLAttributes,
  IntrinsicElements,
  SVGAttributes,
  ScriptHTMLAttributes,
} from './jsx-generated';

interface QwikScriptHTMLAttributes<T> extends ScriptHTMLAttributes<T> {
  events?: string[];
}

interface QwikCustomHTMLAttributes<T> extends HTMLAttributes<T> {
  [key: string]: any;
}

interface QwikCustomSVGAttributes<T> extends SVGAttributes<T> {
  [key: string]: any;
}

interface QwikCustomHTMLElement extends HTMLElement {}
interface QwikCustomSVGElement extends SVGElement {}

/**
 * @public
 */
export interface QwikIntrinsicAttributes {
  key?: string | number | undefined | null;
}

/**
 * @public
 */
export interface QwikIntrinsicElements extends IntrinsicElements {
  script: QwikScriptHTMLAttributes<HTMLScriptElement>;
  [key: string]:
    | QwikCustomHTMLAttributes<QwikCustomHTMLElement>
    | QwikCustomSVGAttributes<QwikCustomSVGElement>;
}

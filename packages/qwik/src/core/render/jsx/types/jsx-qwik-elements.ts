import type { HTMLAttributes, IntrinsicElements, ScriptHTMLAttributes } from './jsx-generated';

interface QwikScriptHTMLAttributes<T> extends ScriptHTMLAttributes<T> {
  events?: string[];
}

interface QwikCustomHTMLAttributes<T> extends HTMLAttributes<T> {
  [key: string]: any;
}

interface QwikCustomHTMLElement extends HTMLElement {}

/**
 * @public
 */
export interface QwikIntrinsicAttributes {}

/**
 * @public
 */
export interface QwikIntrinsicElements extends IntrinsicElements {
  script: QwikScriptHTMLAttributes<HTMLScriptElement>;
  [key: string]: QwikCustomHTMLAttributes<QwikCustomHTMLElement>;
}

import type { HTMLAttributes, IntrinsicHTMLElements, ScriptHTMLAttributes } from './jsx-generated';

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
export interface QwikIntrinsicAttributes {
  key?: string | number | undefined | null;
}

/**
 * @public
 */
export interface QwikIntrinsicElements extends IntrinsicHTMLElements {
  script: QwikScriptHTMLAttributes<HTMLScriptElement>;
  [key: string]: QwikCustomHTMLAttributes<QwikCustomHTMLElement>;
}

import type { JSXChildren } from './types/jsx-qwik-attributes';
import type { FunctionComponent } from './types/jsx-node';

const unsupportedJsx = (): never => {
  throw new Error('JSX must be transformed by the Qwik compiler.');
};

/** Compiler-only fragment marker with a callable JSX type. @public */
export const Fragment = Symbol('Fragment') as unknown as FunctionComponent<{
  children?: JSXChildren;
}>;
export const jsx = (_type: unknown, _props: unknown): never => unsupportedJsx();
export const jsxs = (_type: unknown, _props: unknown): never => unsupportedJsx();
export const jsxDEV = (_type: unknown, _props: unknown): never => unsupportedJsx();

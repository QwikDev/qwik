import type { FunctionComponent, JSXNodeInternal } from '../shared/jsx/types/jsx-node';
import type { ValueOrPromise } from '../shared/utils/types';
import type { SSRContainer, SSRRenderJSXOptions } from './ssr-types';

const InternalServerComponentSymbol = Symbol('qInternalServerComponent');

/** @internal */
export type InternalServerComponentHandler = (
  ssr: SSRContainer,
  jsx: JSXNodeInternal,
  options: SSRRenderJSXOptions
) => ValueOrPromise<void>;

/** @internal */
export type InternalServerComponent<PROPS = unknown> = FunctionComponent<PROPS> & {
  [InternalServerComponentSymbol]: InternalServerComponentHandler;
};

/** @internal */
export const createInternalServerComponent = <PROPS>(
  handler: InternalServerComponentHandler
): InternalServerComponent<PROPS> => {
  const component = (() => {
    throw new Error('Internal server component must be handled by the SSR renderer.');
  }) as unknown as InternalServerComponent<PROPS>;
  component[InternalServerComponentSymbol] = handler;
  return component;
};

/** @internal */
export const isInternalServerComponent = (type: unknown): type is InternalServerComponent => {
  return typeof type === 'function' && InternalServerComponentSymbol in type;
};

/** @internal */
export const getInternalServerComponentHandler = (
  type: InternalServerComponent
): InternalServerComponentHandler => {
  return type[InternalServerComponentSymbol];
};

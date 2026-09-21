import { registerSingleton } from '../singletons';
import { jsx, RenderOnce } from './jsx-runtime';
import type { FunctionComponent, JSXNode, JSXOutput } from './types/jsx-node';
import type { JSXChildren } from './types/jsx-qwik-attributes';

/** @public */
export const SkipRender: JSXNode = Symbol.for('qwik.skip render') as any;

// The renderer recognizes these by identity, so all copies of core share the one function.

/** @public */
export const SSRRaw = registerSingleton<FunctionComponent<{ data: string }>>(
  'SSRRaw',
  () => () => null
);

/** @public */
export const SSRComment = registerSingleton<FunctionComponent<{ data: string }>>(
  'SSRComment',
  () => () => null
);

/** @public */
export const SSRStreamBlock = registerSingleton<FunctionComponent<{ children?: JSXOutput }>>(
  'SSRStreamBlock',
  () => (props) => props.children
);

/** @public */
export type SSRStreamProps = {
  children: SSRStreamChildren;
};

/** @public */
export interface SSRStreamWriter {
  write(chunk: JSXOutput): void;
}

/** @public */
export type SSRStreamChildren =
  | AsyncGenerator<JSXChildren, void, any>
  | ((stream: SSRStreamWriter) => Promise<void>)
  | (() => AsyncGenerator<JSXChildren, void, any>);

/** @public */
export const SSRStream = registerSingleton<FunctionComponent<SSRStreamProps>>(
  'SSRStream',
  () => (props, key) => jsx(RenderOnce, { children: jsx(InternalSSRStream, props) }, key)
);

/** @public */
export type SSRHintProps = {
  dynamic?: boolean;
};

export const InternalSSRStream: FunctionComponent<SSRStreamProps> = () => null;

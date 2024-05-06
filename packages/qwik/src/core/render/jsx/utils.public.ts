import { jsx, RenderOnce } from '../jsx/jsx-runtime';
import type { StreamWriter } from '../ssr/render-ssr';
import type { FunctionComponent, JSXNode } from './types/jsx-node';
import type { JSXChildren } from './types/jsx-qwik-attributes';

/** @public */
export const SkipRender: JSXNode = Symbol('skip render') as any;

/** @public */
export const SSRRaw: FunctionComponent<{ data: string }> = (() => null) as any;

/** @public */
export const SSRComment: FunctionComponent<{ data: string }> = (props) =>
  jsx(SSRRaw, { data: `<!--${props.data}-->` }, null) as any;

/** @public */
export const SSRStreamBlock: FunctionComponent<{ children?: any }> = (props) => {
  return [
    jsx(SSRComment, { data: 'qkssr-pu' }),
    props.children,
    jsx(SSRComment, { data: 'qkssr-po' }),
  ] as any;
};

/** @public */
export type SSRStreamProps = {
  children:
    | AsyncGenerator<JSXChildren, void, any>
    | ((stream: StreamWriter) => Promise<void>)
    | (() => AsyncGenerator<JSXChildren, void, any>);
};

/** @public */
export const SSRStream: FunctionComponent<SSRStreamProps> = (props, key) =>
  jsx(RenderOnce, { children: jsx(InternalSSRStream, props) }, key);

/** @public */
export type SSRHintProps = {
  dynamic?: boolean;
};

/**
 * @deprecated - It has no effect
 * @public
 */
export const SSRHint: FunctionComponent<SSRHintProps> = (() => null) as any;

export const InternalSSRStream: FunctionComponent<SSRStreamProps> = () => null;

import { STREAM_BLOCK_END_COMMENT, STREAM_BLOCK_START_COMMENT } from '../utils/markers';
import { jsx, RenderOnce } from './jsx-runtime';
import type { FunctionComponent, JSXNode, JSXOutput } from './types/jsx-node';
import type { JSXChildren } from './types/jsx-qwik-attributes';

/** @public */
export const SkipRender: JSXNode = Symbol('skip render') as any;

/** @public */
export const SSRRaw: FunctionComponent<{ data: string }> = () => null;

/** @public */
export const SSRComment: FunctionComponent<{ data: string }> = () => null;

/** @public */
export const SSRStreamBlock: FunctionComponent<{ children?: JSXOutput }> = (props) => {
  return [
    jsx(SSRComment, { data: STREAM_BLOCK_START_COMMENT }),
    props.children,
    jsx(SSRComment, { data: STREAM_BLOCK_END_COMMENT }),
  ];
};

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
export const SSRStream: FunctionComponent<SSRStreamProps> = (props, key) =>
  jsx(RenderOnce, { children: jsx(InternalSSRStream, props) }, key);

/** @public */
export type SSRHintProps = {
  dynamic?: boolean;
};

export const InternalSSRStream: FunctionComponent<SSRStreamProps> = () => null;

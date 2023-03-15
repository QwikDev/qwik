import { static_subtree } from '../execute-component';
import { jsx, _jsxQ } from '../jsx/jsx-runtime';
import type { StreamWriter } from '../ssr/render-ssr';
import type { FunctionComponent, JSXNode } from './types/jsx-node';
import type { JSXChildren } from './types/jsx-qwik-attributes';

/**
 * @alpha
 */
export const SkipRender: JSXNode = Symbol('skip render') as any;

/**
 * @alpha
 */
export const RenderOnce: FunctionComponent<{
  children?: any;
  key?: string | number | null | undefined;
}> = (props: any, key) => {
  return _jsxQ(Virtual, null, null, props.children, static_subtree, key);
};

/**
 * @alpha
 */
export const Fragment: FunctionComponent<{}> = ((props: any) => props.children) as any;

/**
 * @alpha
 */
export const SSRRaw: FunctionComponent<{ data: string }> = (() => null) as any;

/**
 * @alpha
 */
export const SSRComment: FunctionComponent<{ data: string }> = (props) =>
  jsx(SSRRaw, { data: `<!--${props.data}-->` }, null) as any;

/**
 * @alpha
 */
export const Virtual: FunctionComponent<Record<string, any>> = ((props: any) =>
  props.children) as any;

/**
 * @alpha
 */
export const SSRStreamBlock: FunctionComponent<{ children?: any }> = (props) => {
  return [
    jsx(SSRComment, { data: 'qkssr-pu' }),
    props.children,
    jsx(SSRComment, { data: 'qkssr-po' }),
  ] as any;
};

/**
 * @alpha
 */
export interface SSRStreamProps {
  children:
    | AsyncGenerator<JSXChildren, void, any>
    | ((stream: StreamWriter) => Promise<void>)
    | (() => AsyncGenerator<JSXChildren, void, any>);
}

/**
 * @alpha
 */
export const SSRStream: FunctionComponent<SSRStreamProps> = (props, key) =>
  jsx(RenderOnce, { children: jsx(InternalSSRStream, props) }, key);

/**
 * @alpha
 */
export interface SSRHintProps {
  dynamic?: boolean;
}

/**
 * @alpha
 */
export const SSRHint: FunctionComponent<SSRHintProps> = (() => null) as any;

export const InternalSSRStream: FunctionComponent<SSRStreamProps> = () => null;

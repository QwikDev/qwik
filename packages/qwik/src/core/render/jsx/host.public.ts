import type { ValueOrPromise } from '../../util/types';
import { jsx } from '../jsx/jsx-runtime';
import type { StreamWriter } from '../ssr/render-ssr';
import type { FunctionComponent } from './types/jsx-node';
import type { JSXChildren } from './types/jsx-qwik-attributes';

/**
 * @alpha
 */
export const SkipRerender: FunctionComponent<{}> = ((props: any) => props.children) as any;

/**
 * @alpha
 */
export const SSRComment: FunctionComponent<{ data: string }> = (() => null) as any;

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
export interface StreamProps {
  children: (stream: StreamWriter) => ValueOrPromise<void> | AsyncGenerator<JSXChildren, void, any>;
}

/**
 * @alpha
 */
export const SSRStream: FunctionComponent<StreamProps> = (() => null) as any;

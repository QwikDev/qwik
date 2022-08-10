import { jsx } from '../jsx/jsx-runtime';
import type { FunctionComponent } from './types/jsx-node';

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

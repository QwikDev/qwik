import type { JSXNode } from '@builder.io/qwik/jsx-runtime';
import { _IMMUTABLE } from '../../internal';

export function fixJsxProps(jsx: JSXNode<unknown>) {
  const mutableProps = jsx.props;
  const immutableProps = jsx.immutableProps;
  const mutablePropsResult: Record<string, unknown> = {};
  const immutablePropsResult: Record<string, unknown> = {};
  for (const prop in mutableProps) {
    let isImmutable = false;
    let value: null | string | typeof _IMMUTABLE = null;
    if (immutableProps && prop in immutableProps) {
      isImmutable = true;
      value = immutableProps[prop] as typeof value;
      if (value === _IMMUTABLE) {
        value = mutableProps[prop] as typeof value;
      }
    } else {
      value = mutableProps[prop] as typeof value;
    }
    isImmutable ? (immutablePropsResult[prop] = value) : (mutablePropsResult[prop] = value);
  }
  for (const prop in immutableProps) {
    if (mutableProps && prop in mutableProps) {
      continue;
    }
    const value = immutableProps[prop] as null | string | typeof _IMMUTABLE;
    if (value !== _IMMUTABLE) {
      immutablePropsResult[prop] = value;
    }
  }
  jsx.props = mutablePropsResult;
  jsx.immutableProps = jsx.immutableProps ? immutablePropsResult : null;
}

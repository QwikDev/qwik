import type { Props } from '../props/props.public';
import { getContext, getProps } from '../props/props';
import { getInvokeContext } from './use-core';
import { useHostElement } from './use-host-element.public';

export function useProps(): Props {
  const ctx = getInvokeContext();
  let props = ctx.props;
  if (!props) {
    props = ctx.props = getProps(getContext(useHostElement()));
  }
  return props;
}

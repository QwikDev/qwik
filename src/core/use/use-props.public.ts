import { useHostElement } from '..';
import { getProps, Props } from '../props/props.public';
import { getInvokeContext } from './use-core';

export function useProps(): Props {
  const ctx = getInvokeContext();
  let props = ctx.props;
  if (!props) {
    props = ctx.props = getProps(useHostElement());
  }
  return props;
}

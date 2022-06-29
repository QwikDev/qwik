import { QSlot } from '../../util/markers';
import { isArray } from '../../util/types';
import { jsx } from './jsx-runtime';
import type { FunctionComponent } from './types/jsx-node';

/**
 * @public
 */
export const Slot: FunctionComponent<{
  name?: string;
  children?: any;
}> = (props) => {
  const hasChildren = props.children || (isArray(props.children) && props.children.length > 0);
  const newChildrem = !hasChildren
    ? []
    : jsx('q:fallback', {
        children: props.children,
      });

  return jsx(
    QSlot,
    {
      name: props.name,
      children: newChildrem,
    },
    props.name
  );
};

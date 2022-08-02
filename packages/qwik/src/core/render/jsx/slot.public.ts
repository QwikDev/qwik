import { QSlot, QSlotName } from '../../util/markers';
import { isArray } from '../../util/types';
import { jsx } from './jsx-runtime';
import type { FunctionComponent } from './types/jsx-node';

/**
 * @public
 */
export const Slot: FunctionComponent<{
  name?: string;
  as?: string;
  children?: any;
}> = (props) => {
  const hasChildren = isArray(props.children) ? props.children.length > 0 : props.children != null;

  const name = props.name ?? '';
  const tagName = props.as ?? QSlot;
  const newChildrem = !hasChildren
    ? []
    : jsx('q:fallback', {
        children: props.children,
      });

  return jsx(
    tagName,
    {
      [QSlotName]: name,
      children: newChildrem,
    },
    name
  );
};

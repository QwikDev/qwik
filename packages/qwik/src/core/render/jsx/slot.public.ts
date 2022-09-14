import { QSlotS } from '../../util/markers';
import { Virtual } from './utils.public';
import { jsx } from './jsx-runtime';
import type { FunctionComponent } from './types/jsx-node';

/**
 * Allows to project the children of the current component. <Slot/> can only be used within the context of a component defined with `component$`.
 *
 * @public
 */
export const Slot: FunctionComponent<{
  name?: string;
}> = (props) => {
  const name = props.name ?? '';
  return jsx(
    Virtual,
    {
      [QSlotS]: '',
    },
    name
  );
};

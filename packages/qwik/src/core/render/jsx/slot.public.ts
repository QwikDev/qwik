import { QSlotS } from '../../util/markers';
import { Virtual } from './host.public';
import { jsx } from './jsx-runtime';
import type { FunctionComponent } from './types/jsx-node';

/**
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

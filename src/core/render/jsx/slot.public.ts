import { jsx } from './jsx-runtime';
import type { FunctionComponent } from './types/jsx-node';

/**
 * @public
 */
export const Slot: FunctionComponent<{
  name?: string;
  children?: any;
}> = (props) => {
  const hasChildren =
    props.children || (Array.isArray(props.children) && props.children.length > 0);
  const newChildrem = !hasChildren
    ? []
    : jsx('q:fallback', {
        children: props.children,
      });

  return jsx(
    'q:slot',
    {
      name: props.name,
      children: newChildrem,
    },
    props.name
  );
};

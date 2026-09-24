import { registerSingleton } from '../singletons';
import { QSlotS } from '../utils/markers';
import { _jsxSorted, Virtual } from './jsx-internal';
import type { FunctionComponent } from './types/jsx-node';
import type { JSXChildren } from './types/jsx-qwik-attributes';

// The renderer recognizes it by identity, so all copies of core share the one function.
/**
 * Allows to project the children of the current component. `<Slot/>` can only be used within the
 * context of a component defined with `component$`.
 *
 * @public
 */
export const Slot = registerSingleton<
  FunctionComponent<{
    name?: string;
    children?: JSXChildren;
  }>
>('Slot', () => (props) => {
  return _jsxSorted(Virtual, null, { [QSlotS]: '' }, props.children, 0, props.name ?? '');
});

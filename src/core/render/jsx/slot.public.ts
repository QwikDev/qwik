import type { HTMLAttributes } from './types/jsx-generated';
import type { FunctionComponent } from './types/jsx-node';

/**
 * @public
 */
export const Slot: FunctionComponent<HTMLAttributes<{ name?: string }>> = {
  __brand__: 'slot',
} as any;

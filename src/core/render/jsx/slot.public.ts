import type { FunctionComponent } from './types/jsx-node';

/**
 * @public
 */
export const Slot: FunctionComponent<{
  name?: string;
  children?: any;
}> = {
  __brand__: 'slot',
} as any;

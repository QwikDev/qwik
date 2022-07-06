import type { WatchDescriptor } from './use-watch';

/**
 * @alpha
 */
export type Subscriber = WatchDescriptor<any, any> | Element;

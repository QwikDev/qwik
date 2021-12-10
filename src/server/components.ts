import { FunctionComponent, jsx } from '@builder.io/qwik';
import { getQwikLoaderScript, getQwikPrefetchScript } from './scripts';

/**
 * @alpha
 */
export interface QwikLoaderProps {
  events?: string[];
  debug?: boolean;
}

/**
 * @alpha
 */
export const QwikLoader: FunctionComponent<QwikLoaderProps> = ({ events, debug }) => {
  return jsx('script', {
    // It is tempting to add `type="module"` but that breaks in FF because it allows `scroll`
    // event to fire before the module is loaded.
    // type: 'module',
    children: [getQwikLoaderScript({ events, debug })],
  });
};

/**
 * @alpha
 */
export interface QwikPrefetchProps {
  debug?: boolean;
}

/**
 * @alpha
 */
export const QwikPrefetch: FunctionComponent<QwikPrefetchProps> = ({ debug }) => {
  return jsx('script', {
    type: 'module',
    children: [getQwikPrefetchScript({ debug })],
  });
};

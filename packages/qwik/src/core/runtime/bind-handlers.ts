import { _captures, setCaptures } from '../shared/qrl/qrl-class';
import { deserializeCaptures } from '../shared/serdes/captures';
import type { ValueOrPromise } from '../shared/utils/types';
import { Computed } from '../reactive/computed';
import type { Signal } from '../reactive/signal';
import { getOrCreateContainerContext } from './container-context';

const withScopeFromQL = <T>(
  captureIds: string | undefined,
  element: Element,
  run: () => T
): ValueOrPromise<T> => {
  if (typeof captureIds === 'string') {
    const container = getOrCreateContainerContext(element);
    return deserializeCaptures(container, captureIds).then((captures) => {
      setCaptures(captures);
      return run();
    });
  }
  return run();
};

/** @internal */
export function _val(this: string | undefined, _: unknown, element: HTMLInputElement) {
  return withScopeFromQL(this, element, () => {
    const signal = _captures![0] as Signal<unknown>;
    signal.value = element.type === 'number' ? element.valueAsNumber : element.value;
  });
}

/** @internal */
export function _chk(this: string | undefined, _: unknown, element: HTMLInputElement) {
  return withScopeFromQL(this, element, () => {
    const signal = _captures![0] as Signal<unknown>;
    signal.value = element.checked;
  });
}

/** @internal */
export function _res(this: string | undefined, _: unknown, element: Element) {
  return withScopeFromQL(this, element, () => {
    if (_captures) {
      for (let i = 0; i < _captures.length; i++) {
        const capture = _captures[i];
        if (capture instanceof Computed) {
          capture.resume();
        }
      }
    }
  });
}

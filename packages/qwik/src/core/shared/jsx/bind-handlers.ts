import { _captures, deserializeCaptures, setCaptures } from '../../shared/qrl/qrl-class';
import type { Signal } from '../../reactive-primitives/signal.public';
import { getDomContainer, whenContainerDataReady } from '../../client/dom-container';
import { AsyncSignalImpl } from '../../reactive-primitives/impl/async-signal-impl';
import { AsyncSignalFlags } from '../../reactive-primitives/types';

/**
 * Qwikloader provides the captures string of the QRL when calling a handler. In that case we must
 * load the QRL captured scope ourselves. Otherwise, we are being called as a QRL and the captures
 * are already set.
 */
const withScopeFromQL = <T>(
  captureIds: string | undefined,
  element: Element,
  callback: (captures: Readonly<unknown[]> | null) => T
): T | Promise<T> => {
  if (typeof captureIds === 'string') {
    const container = getDomContainer(element);
    return whenContainerDataReady(container, () => {
      const captures = deserializeCaptures(container, captureIds);
      setCaptures(captures);
      return callback(captures);
    });
  }
  return callback(_captures);
};
/**
 * Handles events for bind:value
 *
 * @internal
 */
export function _val(this: string | undefined, _: any, element: HTMLInputElement) {
  return withScopeFromQL(this, element, (captures) => {
    const signal = captures![0] as Signal;
    signal.value = element.type === 'number' ? element.valueAsNumber : element.value;
  });
}

/**
 * Handles events for bind:checked
 *
 * @internal
 */
export function _chk(this: string | undefined, _: any, element: HTMLInputElement) {
  return withScopeFromQL(this, element, (captures) => {
    const signal = captures![0] as Signal;
    signal.value = element.checked;
  });
}

/**
 * Resumes selected state (e.g. polling AsyncSignals) by deserializing captures. Used for
 * document:onQIdle to resume async signals with active polling.
 *
 * @internal
 */
export function _res(this: string | undefined, _: any, element: Element) {
  return withScopeFromQL(this, element, (captures) => {
    // Captures are deserialized, now trigger computation on AsyncSignals
    if (captures) {
      for (let i = 0; i < captures.length; i++) {
        const capture = captures[i];
        if (capture instanceof AsyncSignalImpl && capture.$flags$ & AsyncSignalFlags.CLIENT_ONLY) {
          capture.$computeIfNeeded$();
        }
        // note that polling async signals will automatically schedule themselves so no action needed
      }
    }
  });
}

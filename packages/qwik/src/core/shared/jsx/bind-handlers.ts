import { _captures } from '../../shared/qrl/qrl-class';
import type { Signal } from '../../reactive-primitives/signal.public';
import { invokeFromDOM } from '../../use/use-core';

/**
 * Handles events for bind:value
 *
 * @internal
 */
export function _val(this: string | undefined, _: any, element: HTMLInputElement) {
  return invokeFromDOM(element, _, this, () => {
    const signal = _captures![0] as Signal;
    signal.value = element.type === 'number' ? element.valueAsNumber : element.value;
  });
}

/**
 * Handles events for bind:checked
 *
 * @internal
 */
export function _chk(this: string | undefined, _: any, element: HTMLInputElement) {
  return invokeFromDOM(element, _, this, () => {
    const signal = _captures![0] as Signal;
    signal.value = element.checked;
  });
}

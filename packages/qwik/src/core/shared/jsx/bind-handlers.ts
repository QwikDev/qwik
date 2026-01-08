import type { Signal } from '../../reactive-primitives/signal.public';
import { useLexicalScope } from '../../use/use-lexical-scope.public';

/**
 * Handles events for bind:value
 *
 * @internal
 */
export function _val(this: string, _: any, element: HTMLInputElement) {
  const [signal] = useLexicalScope<[Signal]>();
  signal.value = element.type === 'number' ? element.valueAsNumber : element.value;
}

/**
 * Handles events for bind:checked
 *
 * @internal
 */
export function _chk(this: string, _: any, element: HTMLInputElement) {
  const [signal] = useLexicalScope<[Signal]>();
  signal.value = element.checked;
}

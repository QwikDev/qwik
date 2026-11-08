import { useSignal, useVisibleTask$ } from '@qwik.dev/core';
import { trigger } from '@qwik.dev/core/testing';

export async function triggerAll(container: HTMLElement, selector: string, event: string) {
  const targets = Array.from(container.querySelectorAll(selector));
  for (let index = 0; index < targets.length; index++) {
    await trigger(container, targets[index]!, event);
  }
}

export function useDelay(value: string) {
  const ready = useSignal('---');
  useVisibleTask$(() => {
    ready.value = value;
  });
  return ready;
}

import { sync$ } from '@qwik.dev/core';

export const syncHandler = sync$((_event: Event, element: Element) => {
  element.setAttribute('data-sync', 'imported');
});

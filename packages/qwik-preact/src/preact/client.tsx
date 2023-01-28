import { PreactRoot } from './types';
import { ComponentChild, render as __preact_render, hydrate as __preact_hydrate } from 'preact';

export function createRoot(container: Element): PreactRoot {
  return {
    container: container,
    render: function (children: ComponentChild) {
      __preact_render(children, this.container);
    },
  };
}

export function hydrateRoot(container: Element, element: ComponentChild): PreactRoot {
  __preact_hydrate(element, container);
  return {
    container: container,
    render: function (children: ComponentChild) {
      __preact_render(children, this.container);
    },
  };
}

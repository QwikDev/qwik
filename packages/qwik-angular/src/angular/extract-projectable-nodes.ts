// source: https://github.com/angular/angular/blob/d1ea1f4c7f3358b730b0d94e65b00bc28cae279c/packages/elements/src/extract-projectable-nodes.ts
// this util is not exposed from the Angular package, thus copying it here

export function extractProjectableNodes(host: Element, ngContentSelectors: string[]): Node[][] {
  const nodes = host.childNodes;
  const projectableNodes: Node[][] = ngContentSelectors.map(() => []);
  let wildcardIndex = -1;

  ngContentSelectors.some((selector, i) => {
    if (selector === '*') {
      wildcardIndex = i;
      return true;
    }
    return false;
  });

  for (let i = 0, ii = nodes.length; i < ii; ++i) {
    const node = nodes[i];
    const ngContentIndex = findMatchingIndex(node, ngContentSelectors, wildcardIndex);

    if (ngContentIndex !== -1) {
      projectableNodes[ngContentIndex].push(node);
    }
  }

  return projectableNodes;
}

function findMatchingIndex(node: Node, selectors: string[], defaultIndex: number): number {
  let matchingIndex = defaultIndex;

  if (isElement(node)) {
    selectors.some((selector, i) => {
      if (selector !== '*' && matchesSelector(node, selector)) {
        matchingIndex = i;
        return true;
      }
      return false;
    });
  }

  return matchingIndex;
}

// UTILS

let _matches: (this: any, selector: string) => boolean;

/**
 * Check whether an `Element` matches a CSS selector.
 * NOTE: this is duplicated from @angular/upgrade, and can
 * be consolidated in the future
 */
function matchesSelector(el: any, selector: string): boolean {
  if (!_matches) {
    const elProto = <any>Element.prototype;
    _matches =
      elProto.matches ||
      elProto.matchesSelector ||
      elProto.mozMatchesSelector ||
      elProto.msMatchesSelector ||
      elProto.oMatchesSelector ||
      elProto.webkitMatchesSelector;
  }
  return el.nodeType === Node.ELEMENT_NODE ? _matches.call(el, selector) : false;
}

/**
 * Check whether the input is an `Element`.
 */
export function isElement(node: Node | null): node is Element {
  return !!node && node.nodeType === Node.ELEMENT_NODE;
}

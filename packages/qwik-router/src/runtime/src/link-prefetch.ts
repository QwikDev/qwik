import { event$ } from '@qwik.dev/core';
import { preloadRouteBundles } from './client-navigate';
import { prefetchRoute } from './prefetch-route';
import { isSameOrigin, shouldPreload, toPath } from './utils';

let prefetchedLinks = new WeakSet<HTMLAnchorElement>();
let cleanupPrefetchObserver: (() => void) | undefined;

export const resetLinkPrefetchState = () => {
  prefetchedLinks = new WeakSet();
};

export const refreshLinkPrefetchObserver = (manifestHash?: string) => {
  resetLinkPrefetchState();
  cleanupPrefetchObserver?.();
  cleanupPrefetchObserver = createLinkPrefetchObserver(manifestHash);
};

export const linkPrefetchInit = (manifestHash: string) =>
  event$(() => {
    refreshLinkPrefetchObserver(manifestHash);
  });

export const createLinkPrefetchObserver = (manifestHash?: string): (() => void) => {
  const anchors = document.querySelectorAll<HTMLAnchorElement>('a[q\\:link][data-q-prefetch]');

  const prefetchAnchor = (anchor: HTMLAnchorElement, observer?: IntersectionObserver) => {
    if (prefetchedLinks.has(anchor)) {
      return;
    }

    prefetchedLinks.add(anchor);
    observer?.unobserve(anchor);

    if ((navigator as any).connection?.saveData || !anchor.href) {
      return;
    }

    let url: URL;
    try {
      url = new URL(anchor.href);
    } catch {
      return;
    }

    const currentUrl = new URL(location.href);
    if (!isSameOrigin(url, currentUrl) || !shouldPreload(toPath(url), { url: currentUrl })) {
      return;
    }

    const mode = anchor.getAttribute('data-q-prefetch') || '';
    if (mode.includes('b')) {
      preloadRouteBundles(url.pathname);
    }
    if (mode.includes('d')) {
      prefetchRoute(url, true, 0.8, manifestHash, false);
    }
  };

  if (typeof IntersectionObserver === 'undefined') {
    anchors.forEach((anchor) => prefetchAnchor(anchor));
    return () => {};
  }

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        prefetchAnchor(entry.target as HTMLAnchorElement, observer);
      }
    }
  });

  anchors.forEach((anchor) => observer.observe(anchor));

  return () => {
    observer.disconnect();
  };
};

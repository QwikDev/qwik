import { isBrowser, type QRL } from '@qwik.dev/core';
import type { PreventNavigateCallback } from './types';
import type { ViewTransition } from './view-transition';

// Gets populated by registerPreventNav on the client
export const preventNav: {
  $cbs$?: Set<QRL<PreventNavigateCallback>> | undefined;
  $handler$?: (event: BeforeUnloadEvent) => void;
} = {};

// Track navigations during prevent so we don't overwrite.
// We need to use an object so we can write into it from qrls.
export const internalState: {
  navCount: number;
  attemptCount: number;
  currentTransition?: ViewTransition;
} = { navCount: 0, attemptCount: 0 };

export const registerPreventNav = (fn$: QRL<PreventNavigateCallback>) => {
  if (!isBrowser) {
    return;
  }
  preventNav.$handler$ ||= (event: BeforeUnloadEvent) => {
    // track navigations during prevent so we don't overwrite
    internalState.attemptCount++;
    if (!preventNav.$cbs$) {
      return;
    }
    const prevents = [...preventNav.$cbs$.values()].map((cb) =>
      cb.resolved ? cb.resolved() : cb()
    );
    // this catches both true and Promise<any>
    // we assume a Promise means to prevent the navigation
    if (prevents.some(Boolean)) {
      event.preventDefault();
      // legacy support
      event.returnValue = true;
    }
  };

  (preventNav.$cbs$ ||= new Set()).add(fn$);
  // we need the QRLs to be synchronous if possible, for the beforeunload event
  fn$.resolve();
  window.addEventListener('beforeunload', preventNav.$handler$);

  return () => {
    if (preventNav.$cbs$) {
      preventNav.$cbs$.delete(fn$);
      if (!preventNav.$cbs$.size) {
        preventNav.$cbs$ = undefined;
        // unregister the event listener if no more callbacks, to make older Firefox happy
        window.removeEventListener('beforeunload', preventNav.$handler$!);
      }
    }
  };
};

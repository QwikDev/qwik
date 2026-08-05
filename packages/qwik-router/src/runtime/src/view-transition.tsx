import transitionCss from './qwik-view-transition.css?inline';

// This types are missing in current typescript version: 5.4.5

interface StartViewTransitionOptions {
  types?: string[] | null;
  update?: ViewTransitionUpdateCallback | null;
}

interface DocumentViewTransition extends Omit<Document, 'startViewTransition'> {
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/Document/startViewTransition) */
  startViewTransition(
    callbackOptions?: ViewTransitionUpdateCallback | StartViewTransitionOptions
  ): ViewTransition;
}

/** [MDN Reference](https://developer.mozilla.org/docs/Web/API/ViewTransition) */
export interface ViewTransition {
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/ViewTransition/finished) */
  readonly finished: Promise<undefined>;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/ViewTransition/ready) */
  readonly ready: Promise<undefined>;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/ViewTransition/updateCallbackDone) */
  readonly updateCallbackDone: Promise<undefined>;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/ViewTransition/skipTransition) */
  skipTransition(): void;
  types?: Set<string>;
}

/** View transitions are opt-in and require browser support. */
export const shouldStartViewTransition = (viewTransition: boolean | undefined): boolean =>
  viewTransition === true && 'startViewTransition' in document;

const VIEW_TRANSITION_STYLE_ID = 'qwik-view-transition';

/** Inject the view-transition stylesheet once, only when a transition actually runs. */
export const ensureViewTransitionStyles = (): void => {
  if (document.getElementById(VIEW_TRANSITION_STYLE_ID)) {
    return;
  }
  const style = document.createElement('style');
  style.id = VIEW_TRANSITION_STYLE_ID;
  style.textContent = transitionCss;
  document.head.appendChild(style);
};

export const startViewTransition = (params: {
  types: string[];
  update: () => Promise<void>;
}): { ready: Promise<void>; transition?: ViewTransition } => {
  if ('startViewTransition' in document) {
    ensureViewTransitionStyles();
    let transition: ViewTransition;
    try {
      // Typed transition starts with Chrome 125 & Safari 18
      transition = (document as DocumentViewTransition).startViewTransition(params);
    } catch {
      // Fallback for Chrome 111 until Chrome 125
      transition = (document as DocumentViewTransition).startViewTransition(params.update);
    }
    const event = new CustomEvent('qviewtransition', { detail: transition });
    document.dispatchEvent(event);
    return { ready: transition.ready as Promise<void>, transition };
  } else {
    return { ready: params.update() };
  }
};

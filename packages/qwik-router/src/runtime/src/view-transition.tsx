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
interface ViewTransition {
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

export const startViewTransition = (params: StartViewTransitionOptions) => {
  if (!params.update) {
    return;
  }
  if ('startViewTransition' in document) {
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
    return transition;
  } else {
    params.update?.();
  }
};

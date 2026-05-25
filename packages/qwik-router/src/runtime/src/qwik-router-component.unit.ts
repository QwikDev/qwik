import { describe, expect, it, vi } from 'vitest';
import { startViewTransition } from './view-transition';

type StartViewTransitionFn = typeof startViewTransition;
type ViewTransition = NonNullable<ReturnType<StartViewTransitionFn>>;

const runNavigationWithViewTransition = (
  navigate: () => Promise<void>,
  opts: {
    isServer: boolean;
    viewTransition?: boolean;
    startTransition?: StartViewTransitionFn;
  }
) => {
  let navigatePromise: ReturnType<typeof navigate> | undefined;
  const navigateOnce = () => {
    if (!navigatePromise) {
      navigatePromise = navigate();
    }
    return navigatePromise;
  };

  const _waitNextPage = () => {
    if (opts.isServer || opts.viewTransition === false) {
      return navigateOnce();
    } else {
      const viewTransition = (opts.startTransition ?? startViewTransition)({
        update: navigateOnce,
        types: ['qwik-navigation'],
      });
      if (!viewTransition) {
        return navigatePromise ?? Promise.resolve();
      }
      return viewTransition.ready;
    }
  };
  return Promise.resolve(_waitNextPage()).catch(async (err) => {
    await navigateOnce();
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new Error(
        'View transition timed out. This can happen if you have "disableCache" in your browser devtools enabled.'
      );
    }
    throw err;
  });
};

describe('view transition navigation', () => {
  it('does not run navigation twice when view transition ready rejects after update ran', async () => {
    const navigate = vi.fn(() => Promise.resolve());
    const timeoutError = new DOMException('View transition timed out', 'TimeoutError');
    const startTransition: StartViewTransitionFn = vi.fn(
      (params: Parameters<StartViewTransitionFn>[0]): ViewTransition => {
        params.update?.();
        const ready = Promise.reject<undefined>(timeoutError);
        ready.catch(() => undefined);
        return {
          ready,
          finished: Promise.resolve(undefined),
          updateCallbackDone: Promise.resolve(undefined),
          skipTransition: vi.fn(),
          types: new Set(params.types ?? []),
        };
      }
    );

    await expect(
      runNavigationWithViewTransition(navigate, {
        isServer: false,
        viewTransition: true,
        startTransition,
      })
    ).rejects.toThrow('View transition timed out');

    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('runs navigation when view transition ready rejects before update ran', async () => {
    const navigate = vi.fn(() => Promise.resolve());
    const timeoutError = new DOMException('View transition timed out', 'TimeoutError');
    const startTransition: StartViewTransitionFn = vi.fn(
      (params: Parameters<StartViewTransitionFn>[0]): ViewTransition => {
        expect(params.update).toBeDefined();
        const ready = Promise.reject<undefined>(timeoutError);
        ready.catch(() => undefined);
        return {
          ready,
          finished: Promise.resolve(undefined),
          updateCallbackDone: Promise.resolve(undefined),
          skipTransition: vi.fn(),
          types: new Set(params.types ?? []),
        };
      }
    );

    await expect(
      runNavigationWithViewTransition(navigate, {
        isServer: false,
        viewTransition: true,
        startTransition,
      })
    ).rejects.toThrow('View transition timed out');

    expect(navigate).toHaveBeenCalledTimes(1);
  });
});

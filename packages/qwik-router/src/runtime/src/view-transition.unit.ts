import { afterEach, describe, expect, it, vi } from 'vitest';
import { shouldStartViewTransition } from './view-transition';

describe('shouldStartViewTransition', () => {
  afterEach(() => vi.unstubAllGlobals());

  const withViewTransitionSupport = (supported: boolean) => {
    vi.stubGlobal('document', supported ? { startViewTransition: () => {} } : {});
  };

  it('is off by default when the prop is omitted', () => {
    withViewTransitionSupport(true);
    expect(shouldStartViewTransition(undefined)).toBe(false);
  });

  it('is off when explicitly disabled', () => {
    withViewTransitionSupport(true);
    expect(shouldStartViewTransition(false)).toBe(false);
  });

  it('is on when opted in and the browser supports it', () => {
    withViewTransitionSupport(true);
    expect(shouldStartViewTransition(true)).toBe(true);
  });

  it('is off when opted in but the browser lacks support', () => {
    withViewTransitionSupport(false);
    expect(shouldStartViewTransition(true)).toBe(false);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ensureViewTransitionStyles, shouldStartViewTransition } from './view-transition';

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

describe('ensureViewTransitionStyles', () => {
  afterEach(() => vi.unstubAllGlobals());

  const fakeDocument = () => {
    const appended: Array<{ id: string; textContent: string }> = [];
    return {
      appended,
      getElementById: (id: string) => appended.find((el) => el.id === id) ?? null,
      createElement: () => ({ id: '', textContent: '' }),
      head: { appendChild: (el: { id: string; textContent: string }) => appended.push(el) },
    };
  };

  it('injects the view-transition stylesheet exactly once', () => {
    const doc = fakeDocument();
    vi.stubGlobal('document', doc);
    ensureViewTransitionStyles();
    ensureViewTransitionStyles();
    expect(doc.appended).toHaveLength(1);
    expect(doc.appended[0].id).toBe('qwik-view-transition');
  });
});

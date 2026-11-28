import { afterEach, expect, test, vi } from 'vitest';
import { setTheme } from './QwikThemeToggle';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test('applies the selected theme when local storage cannot persist it', () => {
  const setAttribute = vi.fn();
  const removeAttribute = vi.fn();
  vi.stubGlobal('document', {
    firstElementChild: { setAttribute, removeAttribute },
  });
  const storageError = new Error('storage is unavailable');
  vi.stubGlobal('localStorage', {
    setItem: () => {
      throw storageError;
    },
  });
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

  expect(() => setTheme('dark')).not.toThrow();
  expect(setAttribute).toHaveBeenCalledWith('data-theme', 'dark');
  expect(warn).toHaveBeenCalledWith(
    '[Qwik DevTools] Failed to persist theme preference:',
    storageError
  );
});

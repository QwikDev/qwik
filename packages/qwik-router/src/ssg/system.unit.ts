import { afterEach, expect, test, vi } from 'vitest';
import { createSystem } from './system';
import type { SsgGenerateOptions } from './types';

afterEach(() => {
  vi.restoreAllMocks();
});

test('keeps warnings on when log is quiet', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const sys = await createSystem({ log: 'quiet', outDir: '/out' } as SsgGenerateOptions);
  const log = await sys.createLogger();

  log.warn('retrying /');

  expect(warn).toHaveBeenCalledWith('retrying /');
});

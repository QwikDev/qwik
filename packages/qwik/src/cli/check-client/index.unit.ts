import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, vi } from 'vitest';
import type { AppCommand } from '../utils/app-command';
import { getPackageManager, runCommand } from '../utils/utils';
import { runQwikClientCommand } from './index';

vi.mock('../utils/utils', () => ({
  getPackageManager: vi.fn(),
  runCommand: vi.fn(() => ({ install: Promise.resolve(true) })),
}));

test.each(['npm', 'pnpm'])('builds a missing client with %s run', async (pkgManager) => {
  vi.mocked(getPackageManager).mockReturnValue(pkgManager);
  vi.mocked(runCommand).mockClear();
  const rootDir = join(tmpdir(), `qwik-check-client-${randomUUID()}`);
  const app = {
    args: ['check-client', 'src', join(rootDir, 'dist')],
    rootDir,
  } as AppCommand;

  await runQwikClientCommand(app);

  expect(runCommand).toHaveBeenCalledTimes(1);
  expect(runCommand).toHaveBeenCalledWith(pkgManager, ['run', 'build.client'], rootDir);
});

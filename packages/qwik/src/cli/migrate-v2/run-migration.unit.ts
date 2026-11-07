import spawn from 'cross-spawn';
import { EventEmitter } from 'node:events';
import detectPackageManager from 'which-pm-runs';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { runV2Migration } from './run-migration';

vi.mock('cross-spawn', () => ({ default: vi.fn() }));
vi.mock('which-pm-runs', () => ({ default: vi.fn() }));

describe('runV2Migration', () => {
  let exitCode: number;
  beforeEach(() => {
    exitCode = 0;
    vi.mocked(spawn)
      .mockReset()
      .mockImplementation((() => {
        const child = new EventEmitter();
        setTimeout(() => child.emit('close', exitCode));
        return child;
      }) as any);
  });

  test.each([
    [{ name: 'pnpm', version: '9.0.0' }, 'pnpm', ['dlx']],
    [{ name: 'bun', version: '1.2.0' }, 'bunx', []],
    [{ name: 'yarn', version: '4.0.0' }, 'yarn', ['dlx']],
    [{ name: 'yarn', version: '1.22.0' }, 'npx', ['-y']],
    [{ name: 'npm', version: '10.0.0' }, 'npx', ['-y']],
    [undefined, 'npx', ['-y']],
  ])('runs the v2 migration with %o', async (pm, cmd, args) => {
    vi.mocked(detectPackageManager).mockReturnValue(pm);
    await runV2Migration();
    expect(spawn).toHaveBeenCalledWith(cmd, [...args, '@qwik.dev/core@latest', 'migrate-v2'], {
      stdio: 'inherit',
    });
  });

  test('fails when the migration fails', async () => {
    exitCode = 1;
    await expect(runV2Migration()).rejects.toThrow('migrate-v2 exited with code 1');
  });
});

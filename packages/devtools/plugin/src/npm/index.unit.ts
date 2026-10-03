import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createServerRpc, type ServerFunctions } from '@qwik.dev/devtools/kit';
import { connectFakeViteServer } from '../../../kit/src/testing/fake-vite-server';
import { runPackageCommand } from './package-manager';
import { getNpmFunctions } from './index';

vi.mock('./package-manager', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./package-manager')>()),
  runPackageCommand: vi.fn(),
}));

const localClient = { socket: { remoteAddress: '127.0.0.1' } };
const lanClient = { socket: { remoteAddress: '192.168.1.10' } };

describe('package management RPC', () => {
  let callRpcAs: ReturnType<typeof connectFakeViteServer>;

  beforeEach(async () => {
    // An empty project keeps the post-install dependency refresh off the npm registry.
    const root = await mkdtemp(join(tmpdir(), 'qwik-devtools-npm-'));
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'fixture' }));
    callRpcAs = connectFakeViteServer();
    createServerRpc(getNpmFunctions({ config: { root } } as any) as unknown as ServerFunctions);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  test('refuses to install a package for a non-local client', async () => {
    const { r: result } = await callRpcAs(lanClient, 'installPackage', ['left-pad']);

    expect(result.success).toBe(false);
    expect(result.error).toContain('QWIK_DEVTOOLS_ALLOW_REMOTE_PACKAGE_MANAGEMENT');
    expect(runPackageCommand).not.toHaveBeenCalled();
  });

  test('refuses to update a package for a non-local client', async () => {
    const { r: result } = await callRpcAs(lanClient, 'updatePackage', ['vite']);

    expect(result.success).toBe(false);
    expect(runPackageCommand).not.toHaveBeenCalled();
  });

  test('installs a package for a local client', async () => {
    await callRpcAs(localClient, 'installPackage', ['left-pad']);

    expect(runPackageCommand).toHaveBeenCalledOnce();
  });

  test('installs a package for a non-local client after an explicit opt-in', async () => {
    vi.stubEnv('QWIK_DEVTOOLS_ALLOW_REMOTE_PACKAGE_MANAGEMENT', '1');

    await callRpcAs(lanClient, 'installPackage', ['left-pad']);

    expect(runPackageCommand).toHaveBeenCalledOnce();
  });
});

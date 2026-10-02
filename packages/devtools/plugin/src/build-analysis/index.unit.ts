import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { createServerRpc, type ServerFunctions } from '@qwik.dev/devtools/kit';
import { connectFakeViteServer } from '../../../kit/src/testing/fake-vite-server';
import { getBuildAnalysisFunctions, setBuildAnalysisResponseHeaders } from './index';

describe('setBuildAnalysisResponseHeaders', () => {
  test('copies configured Vite server headers onto the report response', () => {
    const headers = new Map<string, number | string | string[]>();
    const res = {
      setHeader(name: string, value: number | string | string[]) {
        headers.set(name, value);
      },
    };

    setBuildAnalysisResponseHeaders(res, {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'X-Skipped': undefined,
    });

    expect(headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
    expect(headers.get('Cross-Origin-Embedder-Policy')).toBe('require-corp');
    expect(headers.has('X-Skipped')).toBe(false);
  });
});

describe('getBuildAnalysisStatus', () => {
  test('lets a local client trigger the build', async () => {
    const root = await mkdtemp(join(tmpdir(), 'qwik-devtools-build-analysis-'));
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({ scripts: { build: 'vite build' } })
    );
    const callRpcAs = connectFakeViteServer();
    createServerRpc(
      getBuildAnalysisFunctions({ config: { root } } as any) as unknown as ServerFunctions
    );

    const status = await callRpcAs(
      { socket: { remoteAddress: '127.0.0.1' } },
      'getBuildAnalysisStatus'
    );

    expect(status.r.canTriggerBuild).toBe(true);
  });
});

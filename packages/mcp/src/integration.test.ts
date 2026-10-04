import { expect, test } from 'vitest';
import { createServer, build } from 'vite';
import { chromium } from '@playwright/test';
import { qwikVite } from '@qwik.dev/core/optimizer';
import { qwikRouter } from '@qwik.dev/router/vite';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { qwikMcp } from '../dist/index.js';

test('bundled documentation works over stdio without Vite or a project directory', async () => {
  const client = new Client({ name: 'offline-docs', version: '1' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('../dist/cli.js', import.meta.url)), '/no-qwik-project-required'],
    stderr: 'pipe',
  });
  try {
    await client.connect(transport);
    const practices = await client.callTool({ name: 'get_best_practices', arguments: {} });
    expect(practices.isError).not.toBe(true);
    expect(practices.structuredContent).toMatchObject({
      version: JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
        .version,
      content: expect.stringContaining('useVisibleTask$'),
    });
    expect(practices.structuredContent).toMatchObject({
      content: expect.stringContaining('@qwik.dev/core'),
    });
    const search = await client.callTool({
      name: 'search_docs',
      arguments: { query: 'useSignal', limit: 2 },
    });
    expect(search.isError).not.toBe(true);
    const result = search.structuredContent as { version: string; results: { id: string }[] };
    expect(result.results).toHaveLength(2);
    expect(result.version).toBe(
      JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version
    );
    const document = await client.callTool({
      name: 'get_doc',
      arguments: { id: result.results[0].id },
    });
    expect(document.structuredContent).toMatchObject({
      version: result.version,
      id: result.results[0].id,
      content: expect.stringContaining('useSignal'),
      url: expect.stringMatching(/^https:\/\/next.qwik.dev\//),
    });
    expect(
      await client.callTool({ name: 'get_doc', arguments: { id: '../../package.json' } })
    ).toMatchObject({ isError: true });
    expect(
      await client.callTool({ name: 'search_docs', arguments: { query: ' ', limit: 21 } })
    ).toMatchObject({ isError: true });
    const caching = await client.callTool({
      name: 'search_docs',
      arguments: { query: 'route loaders and caching' },
    });
    expect(caching.structuredContent).toMatchObject({
      results: expect.arrayContaining([expect.objectContaining({ id: '/docs/caching/' })]),
    });
    expect(
      (await client.callTool({ name: 'get_doc', arguments: { id: '/docs/caching/' } }))
        .structuredContent
    ).toMatchObject({ content: expect.stringContaining('cacheControl') });
    expect(
      (await client.callTool({ name: 'get_doc', arguments: { id: '/docs/glossary/' } }))
        .structuredContent
    ).toMatchObject({ content: expect.stringContaining('## Resumability') });
    expect(
      (await client.callTool({ name: 'get_doc', arguments: { id: '/api/' } })).structuredContent
    ).toMatchObject({ content: expect.stringContaining('/api/qwik-router.md') });
    expect(await client.callTool({ name: 'get_project_info', arguments: {} })).toMatchObject({
      isError: true,
    });
  } finally {
    await client.close();
  }
});

test('project info reads installed versions and scripts without Vite', async () => {
  const root = await mkdtemp(join(tmpdir(), 'qwik-mcp-project-'));
  await mkdir(join(root, 'node_modules/@qwik.dev/core'), { recursive: true });
  await mkdir(join(root, 'node_modules/@qwik.dev/router'), { recursive: true });
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({ scripts: { build: 'vite build', test: 'vitest run' } })
  );
  await writeFile(join(root, 'node_modules/@qwik.dev/core/package.json'), '{"version":"0.0.0"}');
  await writeFile(join(root, 'node_modules/@qwik.dev/router/package.json'), '{"version":"0.0.0"}');
  const client = new Client({ name: 'offline-project', version: '1' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('../dist/cli.js', import.meta.url)), root],
    stderr: 'pipe',
  });
  try {
    await client.connect(transport);
    const first = (await client.callTool({ name: 'get_project_info', arguments: {} }))
      .structuredContent as { documentation: { version: string; matchesProject: boolean } };
    expect(first).toMatchObject({
      root,
      qwikVersion: '0.0.0',
      routerVersion: '0.0.0',
      devServerRunning: false,
      scripts: ['build', 'test'],
      documentation: { version: expect.any(String), matchesProject: false },
    });
    await writeFile(
      join(root, 'node_modules/@qwik.dev/core/package.json'),
      JSON.stringify({ version: first.documentation.version })
    );
    expect(
      (await client.callTool({ name: 'get_project_info', arguments: {} })).structuredContent
    ).toMatchObject({ documentation: { matchesProject: true } });
    expect(await client.callTool({ name: 'list_routes', arguments: {} })).toMatchObject({
      isError: true,
    });
  } finally {
    await client.close();
    await rm(root, { recursive: true, force: true });
  }
});

for (const mode of ['csr', 'ssr']) {
  test(`${mode}: packaged stdio tools inspect live Qwik, errors and routes`, async () => {
    const root = fileURLToPath(new URL(`../tests/fixtures/${mode}`, import.meta.url));
    const plugins = [
      qwikMcp(),
      ...(mode === 'ssr' ? [qwikRouter()] : []),
      qwikVite({ tsOptimizer: true, ...(mode === 'csr' ? { csr: true } : {}) }),
    ];
    const server = await createServer({
      configFile: false,
      root,
      base: mode === 'csr' ? '/app/' : '/',
      plugins,
      server: { host: '127.0.0.1', port: 0 },
      logLevel: 'error',
    });
    await server.listen();
    const browser = await chromium.launch({ headless: true });
    const client = new Client({ name: 'test', version: '1' });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [fileURLToPath(new URL('../dist/cli.js', import.meta.url)), root],
      stderr: 'pipe',
    });
    const call = async (name: string, args = {}) =>
      (await client.callTool({ name, arguments: args })) as {
        isError?: boolean;
        structuredContent?: Record<string, any>;
      };
    try {
      await client.connect(transport);
      expect(await call('inspect_page')).toMatchObject({ isError: true });
      const page = await browser.newPage();
      const pageErrors: string[] = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      page.on('requestfailed', (request) =>
        pageErrors.push(request.url() + ': ' + request.failure()?.errorText)
      );
      page.on('console', (message) => {
        if (message.type() === 'error') {
          pageErrors.push(message.text());
        }
      });
      const url = server.resolvedUrls!.local[0];
      await page.goto(url);
      expect(await page.locator('script[src*="virtual:qwik-mcp"]').count()).toBe(1);
      await page.locator('#counter').waitFor();
      expect(pageErrors).toEqual([]);
      if (mode === 'ssr') {
        // Hook instrumentation must not shift the source lines the optimizer reports.
        expect(await page.locator('#counter').getAttribute('data-qwik-inspector')).toMatch(
          /\/routes\/index\.tsx:5:5$/
        );
      }
      await expect
        .poll(async () => (await call('inspect_page')).structuredContent?.tree)
        .toEqual(expect.arrayContaining([expect.objectContaining({ id: expect.any(String) })]));
      if (mode === 'csr') {
        await expect
          .poll(
            async () =>
              (
                await call('inspect_page', { includeSignalValues: true })
              ).structuredContent?.components?.flatMap((component: any) => component.signals),
            { timeout: 10000 }
          )
          .toEqual(expect.arrayContaining([expect.objectContaining({ name: 'count', value: 0 })]));
      }
      await page.locator('#counter').click();
      await expect
        .poll(
          async () =>
            (await call('inspect_page', { includeHtml: true, selector: '#counter' }))
              .structuredContent?.html,
          { timeout: 10000 }
        )
        .toMatchObject({ content: expect.stringContaining('Count: 1') });
      const snapshot = await call('inspect_page', {
        includeHtml: true,
        selector: '#counter',
        includeSignalValues: true,
      });
      expect(snapshot.isError, JSON.stringify(snapshot) + JSON.stringify(pageErrors)).not.toBe(
        true
      );
      expect((snapshot.structuredContent?.html as any).content).toContain('Count: 1');
      if (mode === 'ssr') {
        const serializedState = await call('inspect_page', { includeSerializedState: true });
        expect(serializedState.isError, JSON.stringify(serializedState)).not.toBe(true);
        expect(serializedState.structuredContent).toMatchObject({
          serializedState: {
            source: 'serialized-dom',
            content: expect.any(String),
            truncated: false,
          },
        });
        const serializedVNodeTree = await call('inspect_page', {
          includeSerializedVNodeTree: true,
        });
        expect(serializedVNodeTree.isError, JSON.stringify(serializedVNodeTree)).not.toBe(true);
        expect(serializedVNodeTree.structuredContent).toMatchObject({
          serializedVNodeTree: {
            source: 'serialized-dom',
            content: expect.any(String),
            truncated: false,
          },
        });
        expect(
          (serializedState.structuredContent?.serializedState as any).content.length
        ).toBeGreaterThan(0);
        expect(
          (serializedVNodeTree.structuredContent?.serializedVNodeTree as any).content.length
        ).toBeGreaterThan(0);
      }
      await expect
        .poll(
          async () =>
            (await call('inspect_page', { includeSignalValues: true })).structuredContent
              ?.components,
          { timeout: 10000 }
        )
        .toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              signals: expect.arrayContaining([
                expect.objectContaining({ name: 'count', value: 1 }),
              ]),
            }),
          ])
        );
      const projectInfo = (await call('get_project_info')).structuredContent!;
      expect(projectInfo).toMatchObject({
        root,
        qwikVersion: expect.any(String),
        devServerRunning: true,
        devUrl: expect.any(String),
        documentation: { version: expect.any(String), matchesProject: expect.any(Boolean) },
      });
      expect(projectInfo.documentation.matchesProject).toBe(
        projectInfo.documentation.version === projectInfo.qwikVersion
      );
      const routes = (await call('list_routes')).structuredContent!;
      expect(routes.routerInstalled).toBe(mode === 'ssr');
      if (mode === 'ssr') {
        expect(routes.routes).toContainEqual({
          pathname: '/[slug]/',
          file: 'src/routes/[slug]/index.tsx',
          params: ['slug'],
          layouts: ['src/routes/layout.tsx'],
        });
        await page.goto(url + 'some-fancy-route/');
        await page.getByText('Hi, fancy route here').waitFor();
        const flatten = (nodes: any[]): any[] =>
          nodes.flatMap((node) => [node, ...flatten(node.children ?? [])]);
        await expect
          .poll(async () => {
            const result = (await call('inspect_page')).structuredContent;
            return result
              ? flatten(result.tree).filter((node) =>
                  node.source?.file.endsWith('/some-fancy-route/index.tsx')
                )
              : [];
          })
          .toEqual([
            expect.objectContaining({ name: 'default' }),
            expect.objectContaining({ name: 'SomeInternalCmp' }),
          ]);
        await page.goto(url);
        await page.locator('#counter').waitFor();
      } else {
        expect(routes.routes).toEqual([]);
      }
      expect(await call('inspect_page', { selector: '#missing' })).toMatchObject({ isError: true });
      expect(await call('inspect_page', { selector: '[' })).toMatchObject({ isError: true });
      server.ws.send({
        type: 'error',
        err: {
          message: 'MCP fixture error',
          stack: '',
          loc: { file: 'fixture.tsx', line: 2, column: 3 },
        },
      });
      await expect
        .poll(async () => (await call('get_dev_errors')).structuredContent)
        .toMatchObject({
          errors: [{ message: 'MCP fixture error', file: 'fixture.tsx', line: 2, column: 3 }],
        });
      server.ws.send({ type: 'update', updates: [] });
      await expect
        .poll(async () => (await call('get_dev_errors')).structuredContent)
        .toMatchObject({ errors: [] });
      const second = await browser.newPage();
      await second.goto(url + '?second');
      await expect.poll(async () => (await call('inspect_page')).isError).toBe(true);
      expect(await call('inspect_page', { url: page.url() })).not.toHaveProperty('isError', true);
      const directory = join(root, 'node_modules/.cache/qwik-mcp');
      const [file] = await readdir(directory);
      const discovery = JSON.parse(await readFile(join(directory, file), 'utf8'));
      if (process.platform !== 'win32') {
        expect((await stat(join(directory, file))).mode & 0o777).toBe(0o600);
      }
      await writeFile(
        join(directory, 'stale-test.json'),
        JSON.stringify({ url: 'http://127.0.0.1:1/__qwik_mcp', token: 'stale' })
      );
      expect(await call('get_project_info')).not.toHaveProperty('isError', true);

      expect((await fetch(discovery.url, { method: 'POST' })).status).toBe(403);
      expect(
        (
          await fetch(discovery.url, {
            method: 'POST',
            headers: { authorization: `Bearer ${discovery.token}`, origin: url },
          })
        ).status
      ).toBe(403);
      const authorized = {
        authorization: `Bearer ${discovery.token}`,
        'content-type': 'application/json',
      };
      const rejectedHost = await new Promise((resolve, reject) => {
        const req = request(
          discovery.url,
          { method: 'POST', headers: { ...authorized, host: 'attacker.example' } },
          (res) => {
            res.resume();
            resolve(res.statusCode);
          }
        );
        req.on('error', reject);
        req.end('{}');
      });
      expect(rejectedHost).toBe(403);
      expect((await fetch(discovery.url, { method: 'GET', headers: authorized })).status).toBe(405);
      expect(
        await (
          await fetch(discovery.url, {
            method: 'POST',
            headers: authorized,
            body: 'x'.repeat(8193),
          })
        ).json()
      ).toMatchObject({ error: 'MCP request is too large.' });
      expect(
        await (
          await fetch(discovery.url, {
            method: 'POST',
            headers: authorized,
            body: JSON.stringify({ name: 'write_file' }),
          })
        ).json()
      ).toMatchObject({ error: 'Unknown MCP tool.' });
      await browser.close();
      await expect.poll(async () => (await call('inspect_page')).isError).toBe(true);
    } finally {
      await browser.close();
      await server.close();
      await unlink(join(root, 'node_modules/.cache/qwik-mcp/stale-test.json')).catch(() => {});
      expect(await call('get_project_info')).toMatchObject({
        structuredContent: { root, devServerRunning: false },
      });
      await client.close();
    }
  }, 60000);
}

test('production build excludes MCP bridge and instrumentation', async () => {
  const root = fileURLToPath(new URL('../tests/fixtures/csr', import.meta.url));
  const result = await build({
    configFile: false,
    root,
    plugins: [qwikMcp(), qwikVite({ csr: true, tsOptimizer: true })],
    build: { write: false },
    logLevel: 'error',
  });
  expect(JSON.stringify(result)).not.toContain('qwik:mcp:');
  expect(JSON.stringify(result)).not.toContain('useCollectHooks');
});

test('IPv6 loopback discovery works', async () => {
  const root = fileURLToPath(new URL('../tests/fixtures/csr', import.meta.url));
  const server = await createServer({
    configFile: false,
    root,
    plugins: [qwikMcp()],
    server: { host: '::1', port: 0 },
    logLevel: 'error',
  });
  await server.listen();
  const client = new Client({ name: 'stream-test', version: '1' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('../dist/cli.js', import.meta.url)), root],
  });
  try {
    await client.connect(transport);
    await expect
      .poll(
        async () =>
          (await client.callTool({ name: 'get_project_info', arguments: {} })).structuredContent
      )
      .toMatchObject({ devUrl: expect.stringContaining('[::1]') });
  } finally {
    await client.close();
    await server.close();
  }
});

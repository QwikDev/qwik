#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createMcpServer } from './server';
import type { ToolName } from './protocol';
import { loadDocs } from './docs';

const root = resolve(process.argv[2] ?? process.cwd());
async function readProjectInfo() {
  const require = createRequire(join(root, 'package.json'));
  const version = async (name: string) =>
    JSON.parse(await readFile(require.resolve(`${name}/package.json`), 'utf8')).version as string;
  let qwikVersion: string;
  try {
    qwikVersion = await version('@qwik.dev/core');
  } catch {
    throw new Error(`Cannot resolve @qwik.dev/core in ${root}.`);
  }
  let routerVersion: string | undefined;
  try {
    routerVersion = await version('@qwik.dev/router');
  } catch {
    // Router is optional.
  }
  let scripts: string[] = [];
  try {
    const project = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    if (project.scripts && typeof project.scripts === 'object' && !Array.isArray(project.scripts)) {
      scripts = Object.keys(project.scripts).filter(
        (name) => typeof project.scripts[name] === 'string'
      );
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
  const documentationVersion = (await loadDocs()).version;
  return {
    root,
    qwikVersion,
    ...(routerVersion ? { routerVersion } : {}),
    scripts,
    documentation: {
      version: documentationVersion,
      matchesProject: documentationVersion === qwikVersion,
    },
  };
}

async function callVite(
  session: { url: string; token: string },
  name: ToolName,
  args: Record<string, unknown>
) {
  const response = await fetch(session.url, {
    method: 'POST',
    headers: { authorization: `Bearer ${session.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ name, args }),
    signal: AbortSignal.timeout(7000),
    redirect: 'error',
  });
  if (!response.ok) {
    throw new Error('Qwik MCP endpoint is unavailable.');
  }
  return (await response.json()) as { result?: Record<string, unknown>; error?: string };
}

serveStdio(() =>
  createMcpServer(async (name, args) => {
    const projectInfo = name === 'get_project_info' ? await readProjectInfo() : undefined;
    const directory = join(root, 'node_modules/.cache/qwik-mcp');
    let files: string[];
    try {
      files = (await readdir(directory)).filter((file) => file.endsWith('.json'));
    } catch (error) {
      if (projectInfo && (error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { ...projectInfo, devServerRunning: false };
      }
      if (projectInfo) {
        throw error;
      }
      throw new Error(
        `No Qwik MCP server in ${root}. Add qwikMcp() to Vite and start the development server.`
      );
    }
    const sessions = await Promise.all(
      files.map(async (file) => {
        try {
          const session = JSON.parse(await readFile(join(directory, file), 'utf8'));
          const url = new URL(session.url);
          if (
            url.protocol !== 'http:' ||
            !['127.0.0.1', '[::1]'].includes(url.hostname) ||
            url.pathname !== '/__qwik_mcp' ||
            url.search ||
            url.hash ||
            url.username ||
            url.password ||
            typeof session.token !== 'string'
          ) {
            return null;
          }
          const reply = await callVite(session, 'get_project_info', {});
          return { session, reply };
        } catch {
          return null;
        }
      })
    );
    const active = sessions.filter((session) => session !== null);
    if (!active.length) {
      if (projectInfo) {
        return { ...projectInfo, devServerRunning: false };
      }
      throw new Error('No running Qwik MCP server. Start Vite with qwikMcp().');
    }
    if (active.length > 1) {
      throw new Error(
        'Multiple Qwik development servers are running in this project. Stop the extra servers.'
      );
    }
    const reply =
      name === 'get_project_info' ? active[0].reply : await callVite(active[0].session, name, args);
    if (reply.error) {
      throw new Error(reply.error);
    }
    if (projectInfo) {
      return { ...projectInfo, ...reply.result, devServerRunning: true };
    }
    return reply.result!;
  })
);

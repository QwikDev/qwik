#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createMcpServer } from './server';
import type { ToolName } from './protocol';

const root = resolve(process.argv[2] ?? process.cwd());
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
    const directory = join(root, 'node_modules/.cache/qwik-mcp');
    let files: string[];
    try {
      files = (await readdir(directory)).filter((file) => file.endsWith('.json'));
    } catch {
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
    return reply.result!;
  })
);

import { expect, test } from 'vitest';
import { createMcpServer } from './server';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';

test('advertises six read-only tools, validates inputs and returns tool errors', async () => {
  const server = createMcpServer(async (name, args) => {
    if (name === 'inspect_page') {
      throw new Error('Open a Qwik page in your browser.');
    }
    return { routerInstalled: false, routes: [] };
  });
  const client = new Client({ name: 'test', version: '1' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual([
      'get_project_info',
      'list_routes',
      'get_dev_errors',
      'inspect_page',
      'search_docs',
      'get_doc',
    ]);
    expect(tools.every((tool) => tool.annotations?.readOnlyHint && tool.outputSchema)).toBe(true);
    expect(
      (await client.callTool({ name: 'list_routes', arguments: {} })).structuredContent
    ).toEqual({ routerInstalled: false, routes: [] });
    expect(await client.callTool({ name: 'inspect_page', arguments: {} })).toMatchObject({
      isError: true,
      content: [{ type: 'text', text: 'Open a Qwik page in your browser.' }],
    });
    expect(
      await client.callTool({ name: 'inspect_page', arguments: { includeHtml: 'yes' } })
    ).toMatchObject({ isError: true });
  } finally {
    await client.close();
    await server.close();
  }
});

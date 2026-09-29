import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { version } from '../package.json';
import type { DevtoolsVNodeTreeNode } from '../../devtools/kit/src/protocol/vnode';

import { inspectInput, pageInput, type ToolName } from './protocol';

const node: z.ZodType<DevtoolsVNodeTreeNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    name: z.string().optional(),
    label: z.string().optional(),
    source: z.object({ file: z.string() }).optional(),
    children: z.array(node).optional(),
  })
);
const inspectOutput = z.object({
  url: z.string(),
  tree: z.array(node),
  components: z.array(
    z.object({
      path: z.string(),
      name: z.string(),
      hooks: z.array(
        z.object({ variableName: z.string(), hookType: z.string(), category: z.string() })
      ),
      signals: z.array(
        z.object({ name: z.string(), hookType: z.string(), value: z.unknown().optional() })
      ),
    })
  ),
  html: z
    .object({ source: z.literal('live-dom'), content: z.string(), truncated: z.boolean() })
    .optional(),
});

export function createMcpServer(
  call: (name: ToolName, args: Record<string, unknown>) => Promise<Record<string, unknown>>
) {
  const server = new McpServer({ name: 'qwik', version });
  const tools: Record<
    ToolName,
    { description: string; inputSchema: z.ZodObject; outputSchema: z.ZodObject }
  > = {
    get_project_info: {
      description: 'Read the running Qwik project root, versions and development URL.',
      inputSchema: z.object({}),
      outputSchema: z.object({
        root: z.string(),
        qwikVersion: z.string(),
        routerVersion: z.string().optional(),
        devUrl: z.string(),
      }),
    },
    list_routes: {
      description:
        'List routes and layouts from the Qwik Router Vite plugin. Plain Qwik returns routerInstalled: false.',
      inputSchema: z.object({}),
      outputSchema: z.object({
        routerInstalled: z.boolean(),
        routes: z.array(
          z.object({
            pathname: z.string(),
            file: z.string(),
            params: z.array(z.string()),
            layouts: z.array(z.string()),
          })
        ),
      }),
    },
    get_dev_errors: {
      description:
        'Read Vite errors observed by a connected browser page, cleared after successful HMR. Supply url when multiple pages are open.',
      inputSchema: pageInput,
      outputSchema: z.object({
        url: z.string(),
        errors: z.array(
          z.object({
            message: z.string(),
            file: z.string().optional(),
            line: z.number().optional(),
            column: z.number().optional(),
          })
        ),
      }),
    },
    inspect_page: {
      description:
        'Inspect a connected Qwik page and component hooks. HTML and signal values are opt-in. HTML is current live DOM, limited to 64 KiB; selector scopes only the HTML fragment. Supply url when multiple pages are open.',
      inputSchema: inspectInput,
      outputSchema: inspectOutput,
    },
  };
  for (const [name, config] of Object.entries(tools)) {
    server.registerTool(
      name,
      {
        ...config,
        annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      },
      async (args) => {
        try {
          const structuredContent = await call(name as ToolName, args);
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(structuredContent) }],
            structuredContent,
          };
        } catch (error) {
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: error instanceof Error ? error.message : String(error),
              },
            ],
          };
        }
      }
    );
  }
  return server;
}

import type { ReplModuleInput } from './types';

export const ensureDefaultFiles = (appFiles: ReplModuleInput[]) => {
  const files: ReplModuleInput[] = JSON.parse(JSON.stringify(appFiles));

  if (!files.some((i) => i.code === '/root.tsx')) {
    files.push({ path: '/root.tsx', code: DEFAULT_ROOT, hidden: true });
  }

  if (!files.some((i) => i.code === '/entry.server.tsx')) {
    files.push({ path: '/entry.server.tsx', code: DEFAULT_ENTRY_SERVER, hidden: true });
  }

  return files;
};

export const DEFAULT_ENTRY_SERVER = `
import { renderToString, RenderOptions } from '@builder.io/qwik/server';
import { Root } from './root';

export function render(opts: RenderOptions) {
  return renderToString(<Root />, opts);
}
`;

export const DEFAULT_ROOT = `
import { App } from './app';

export const Root = () => {
  return (
    <html>
      <head>
        <title>Tutorial</title>
      </head>
      <body>
        <App />
      </body>
    </html>
  );
};
`;

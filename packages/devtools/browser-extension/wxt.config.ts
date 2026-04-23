import { defineConfig } from 'wxt';
import { resolve } from 'node:path';

export default defineConfig({
  srcDir: 'src',
  imports: false,
  vite: () => ({
    resolve: {
      alias: {
        '@devtools/ui': resolve(__dirname, '../ui/lib'),
      },
      conditions: ['production'],
    },
    define: {
      'globalThis.qDev': 'false',
      'globalThis.qSerialize': 'false',
    },
  }),
  manifest: {
    name: 'Qwik DevTools',
    description: 'Developer tools for Qwik framework applications',
    version: '0.1.0',
    permissions: ['tabs'],
    devtools_page: 'devtools.html',
    web_accessible_resources: [
      {
        resources: ['nav-hook.js', 'inspect-hook.js', 'devtools-hook.js', 'vnode-bridge.js'],
        matches: ['<all_urls>'],
      },
    ],
  },
});

import { createInPageBridge } from '../../devtools/kit/src/client-bridge';
import { locateElement, readPage } from './page';
import type { InspectInput, LocateInput } from './protocol';

const hot = import.meta.hot!;
const pageId = crypto.randomUUID();
const bridge = createInPageBridge({ isBrowser: true });
let errors: { message: string; file?: string; line?: number; column?: number }[] = [];
const register = () => hot.send('qwik:mcp:page', { pageId, url: location.href });
hot.on('vite:ws:connect', register);
hot.on('vite:error', ({ err }) => {
  errors = [
    {
      message: err.message,
      file: err.loc?.file ?? err.id,
      line: err.loc?.line,
      column: err.loc?.column,
    },
  ];
});
hot.on('vite:afterUpdate', () => {
  errors = [];
  register();
});
hot.on(
  'qwik:mcp:request',
  async ({ id, name, args }: { id: string; name: string; args: InspectInput & LocateInput }) => {
    try {
      if (args.url && args.url !== location.href) {
        throw new Error(`Page navigated. Retry with url: ${location.href}`);
      }
      let result;
      if (name === 'get_dev_errors') {
        result = { url: location.href, errors };
      } else if (name === 'locate_element') {
        result = locateElement(args, document, location.href);
      } else {
        result = await readPage(args, document, bridge, location.href);
      }
      hot.send('qwik:mcp:response', { id, result });
    } catch (error) {
      hot.send('qwik:mcp:response', { id, error: String(error) });
    }
  }
);
window.addEventListener('pagehide', () => hot.send('qwik:mcp:leave', { pageId }));
window.addEventListener('popstate', register);
// Qwik navigation updates history without dispatching popstate.
const heartbeat = setInterval(register, 2000);
register();
hot.dispose(() => {
  clearInterval(heartbeat);
  hot.send('qwik:mcp:leave', { pageId });
});

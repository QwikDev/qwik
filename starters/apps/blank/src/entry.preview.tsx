import type { IncomingMessage, ServerResponse } from 'http';
import render from './entry.ssr';

// Create the Qwik ssr preview middleware
// Imported by vite preview
export default async function (req: IncomingMessage, res: ServerResponse, next: (e?: any) => void) {
  try {
    await render({
      stream: res,
      envData: {
        url: `http://${req.headers.host}${req.url}`,
      },
    });
    res.end();
  } catch (e) {
    next(e);
  }
}

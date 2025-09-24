import { describe, it, expect, vi, beforeEach } from 'vitest';
import { wrapResponseForHtmlTransform } from './html-transform-wrapper';
import type { IncomingMessage } from 'node:http';
import type { ViteDevServer } from 'vite';
import { createServer } from 'vite';
import { EventEmitter } from 'node:events';

class MockServerResponse extends EventEmitter {
  output = '';
  headers: Record<string, string | number | string[]> = {};
  statusCode = 200;

  private _origWrite = vi.fn((chunk: any, cb?: () => void) => {
    this.output += chunk.toString();
    cb?.();
    return true;
  });

  private _origEnd = vi.fn((chunk?: any, cb?: () => void) => {
    if (chunk && typeof chunk !== 'function') {
      this.output += chunk.toString();
    }
    this.emit('finish');
    cb?.();
    return this as any;
  });

  write = this._origWrite;
  end = this._origEnd;

  setHeader = vi.fn((name: string, value: string | number | string[]) => {
    this.headers[name.toLowerCase()] = value;
  });

  writeHead = vi.fn((statusCode: number, headers?: Record<string, string | number | string[]>) => {
    this.statusCode = statusCode;
    if (headers) {
      for (const [key, value] of Object.entries(headers)) {
        this.headers[key.toLowerCase()] = value;
      }
    }
    return this as any;
  });

  // Mocks for spying on the original methods if they were patched
  get origWrite() {
    return this._origWrite;
  }
  get origEnd() {
    return this._origEnd;
  }
}

describe('wrapResponseForHtmlTransform', () => {
  let req: IncomingMessage;
  let res: MockServerResponse;
  let server: ViteDevServer;

  beforeEach(() => {
    req = { url: '/' } as IncomingMessage;
    res = new MockServerResponse();

    server = {
      transformIndexHtml: vi.fn(async (url, html) => {
        return html
          .replace('<head>', '<head><!-- head pre content -->')
          .replace('</head>', '<!-- head post content --></head>')
          .replace('<body>', '<body><!-- body pre content -->')
          .replace('</body>', '<!-- body post content --></body>');
      }),
    } as any;
  });

  it('should transform HTML response in a single chunk', async () => {
    wrapResponseForHtmlTransform(req, res as any, server);

    res.setHeader('Content-Type', 'text/html');
    res.write('<html><head></head><body><h1>Hello</h1>');
    res.end('</body></html>');

    await new Promise((resolve) => res.on('finish', resolve));

    expect(server.transformIndexHtml).toHaveBeenCalledOnce();
    expect(res.output).toBe(
      '<html><head><!-- head pre content --><!-- head post content --></head><body><!-- body pre content --><h1>Hello</h1><!-- body post content --></body></html>'
    );
  });

  it('should not transform non-HTML response', async () => {
    wrapResponseForHtmlTransform(req, res as any, server);

    res.setHeader('Content-Type', 'application/json');
    const json = JSON.stringify({ message: 'hello' });
    res.end(json);

    await new Promise((resolve) => res.on('finish', resolve));

    expect(server.transformIndexHtml).not.toHaveBeenCalled();
    expect(res.output).toBe(json);
  });

  it('should handle streamed HTML response', async () => {
    wrapResponseForHtmlTransform(req, res as any, server);

    res.setHeader('Content-Type', 'text/html');
    res.write('<html><head>');
    res.write('</head><body>');
    res.write('<h1>Hello</h1>');
    res.write('</body>');
    res.end('</html>');

    await new Promise((resolve) => res.on('finish', resolve));

    expect(server.transformIndexHtml).toHaveBeenCalledOnce();
    expect(res.output).toBe(
      '<html><head><!-- head pre content --><!-- head post content --></head><body><!-- body pre content --><h1>Hello</h1><!-- body post content --></body></html>'
    );
  });

  it('should use content-type from writeHead', async () => {
    wrapResponseForHtmlTransform(req, res as any, server);

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.write('<html><head></head><body>');
    res.end('</body></html>');

    await new Promise((resolve) => res.on('finish', resolve));

    expect(server.transformIndexHtml).toHaveBeenCalledOnce();
  });

  it('should fallback to passthrough on transform error', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    server.transformIndexHtml = vi.fn().mockRejectedValue(new Error('Transform failed'));
    wrapResponseForHtmlTransform(req, res as any, server);

    const originalHtml = '<html><head></head><body><h1>Hello</h1></body></html>';
    res.setHeader('Content-Type', 'text/html');
    res.end(originalHtml);

    await new Promise((resolve) => res.on('finish', resolve));

    expect(res.output).toBe(originalHtml);
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error transforming HTML:', expect.any(Error));
    consoleErrorSpy.mockRestore();
  });

  it('should handle head and body tags split across chunks', async () => {
    wrapResponseForHtmlTransform(req, res as any, server);
    res.setHeader('Content-Type', 'text/html');

    res.write('<html><he');
    res.write('ad></h');
    res.write('ead><bo');
    res.write('dy><h1>Hello</h1></bo');
    res.write('dy></html>');
    res.end();

    await new Promise((resolve) => res.on('finish', resolve));

    expect(server.transformIndexHtml).toHaveBeenCalledOnce();
    expect(res.output).toBe(
      '<html><head><!-- head pre content --><!-- head post content --></head><body><!-- body pre content --><h1>Hello</h1><!-- body post content --></body></html>'
    );
  });

  it('should inject vite client script using native vite transform without new line', async () => {
    const viteServer = await createServer({
      root: process.cwd(),
      server: { middlewareMode: true },
      appType: 'custom',
    });
    try {
      // note: we are using the real vite server, not the mocked one from beforeEach
      wrapResponseForHtmlTransform(req, res as any, viteServer);

      res.setHeader('Content-Type', 'text/html');
      res.write('<html><head><title>Test</title></head><body></body></html>');
      res.end();

      await new Promise((resolve) => res.on('finish', resolve));

      expect(res.output).toContain('<script type="module" src="/@vite/client"></script><title>');
    } finally {
      await viteServer.close();
    }
  });
});

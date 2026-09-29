import { expect, test } from 'vitest';
import { EventEmitter } from 'node:events';
import { injectPageBridge } from './stream';

test('injects once across split head tags and flushes before response end', () => {
  const chunks: string[] = [];
  const res = Object.assign(new EventEmitter(), {
    getHeader: (name: string) => (name === 'content-type' ? 'text/html' : undefined),
    removeHeader: () => {},
    write: (chunk: unknown) => {
      chunks.push(String(chunk));
      return true;
    },
    end: (chunk?: unknown) => {
      if (chunk) {
        chunks.push(String(chunk));
      }
    },
  });
  injectPageBridge(res as any, '<script src="bridge"></script>');
  res.write('<!doctype html><he');
  expect(chunks).toEqual([]);
  res.write('ad><title>Test</title>');
  expect(chunks.join('')).toContain('<head><script src="bridge"></script><title>');
  res.write('</head><body>streamed');
  expect(chunks.join('')).toContain('streamed');
  res.end('</body>');
  expect(chunks.join('').match(/src="bridge"/g)).toHaveLength(1);
});

test('preserves split UTF-8 bytes after the head and bounded prefixes without a head', () => {
  const chunks: Buffer[] = [];
  const res = {
    headersSent: false,
    getHeader: (name: string) => (name === 'content-type' ? 'text/html' : undefined),
    removeHeader() {},
    write: (chunk: Buffer) => {
      chunks.push(Buffer.from(chunk));
      return true;
    },
    end() {},
  };
  injectPageBridge(res as any, '<script></script>');
  const bytes = Buffer.from('<head>ą');
  res.write(bytes.subarray(0, bytes.length - 1));
  res.write(bytes.subarray(bytes.length - 1));
  expect(Buffer.concat(chunks).toString()).toBe('<head><script></script>ą');
  const longPrefix = {
    ...res,
    write: (chunk: Buffer) => {
      chunks.push(Buffer.from(chunk));
      return true;
    },
  };
  injectPageBridge(longPrefix as any, '<script></script>');
  longPrefix.write(Buffer.alloc(65536, 'x'));
  expect(chunks.at(-1)?.length).toBe(65536);
});

import type { ServerResponse } from 'node:http';

export function injectPageBridge(res: ServerResponse, script: string) {
  const write = res.write.bind(res);
  const end = res.end.bind(res);
  let prefix = Buffer.alloc(0);
  let finished = false;
  const emit = (
    chunk: string | Uint8Array,
    encoding: BufferEncoding,
    callback?: (error?: Error | null) => void
  ) => {
    if (
      finished ||
      !String(res.getHeader('content-type')).includes('text/html') ||
      res.getHeader('content-encoding')
    ) {
      finished = true;
      return write(chunk, encoding, callback);
    }
    if (!res.headersSent) {
      res.removeHeader('content-length');
    }
    prefix = Buffer.concat([
      prefix,
      typeof chunk === 'string' ? Buffer.from(chunk, encoding) : chunk,
    ]);
    const head = /<head(?:\s[^>]*)?>/i.exec(prefix.toString('latin1'));
    if (head || prefix.length >= 65536) {
      finished = true;
      if (head) {
        const position = head.index + head[0].length;
        prefix = Buffer.concat([
          prefix.subarray(0, position),
          Buffer.from(script),
          prefix.subarray(position),
        ]);
      }
      return write(prefix, callback);
    }
    if (callback) {
      queueMicrotask(callback);
    }
    return true;
  };
  res.write = ((
    chunk: string | Uint8Array,
    encoding?: BufferEncoding | ((error?: Error | null) => void),
    callback?: (error?: Error | null) => void
  ) => {
    return emit(
      chunk,
      typeof encoding === 'string' ? encoding : 'utf8',
      typeof encoding === 'function' ? encoding : callback
    );
  }) as typeof res.write;
  res.end = ((
    chunk?: string | Uint8Array | (() => void),
    encoding?: BufferEncoding | (() => void),
    callback?: () => void
  ) => {
    if (chunk != null && typeof chunk !== 'function') {
      emit(chunk, typeof encoding === 'string' ? encoding : 'utf8');
    }
    if (!finished && prefix.length) {
      write(prefix);
    }
    return end(
      typeof chunk === 'function' ? chunk : typeof encoding === 'function' ? encoding : callback
    );
  }) as typeof res.end;
}

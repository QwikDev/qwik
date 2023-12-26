/** @file Public APIs for the SSR */
import type { StreamWriter } from '../../server/types';
import type { Stringifyable } from '../shared-types';
import type { SSRContainer as ISSRContainer, SsrAttrs } from './types';

export function ssrCreateContainer(
  opts: {
    tagName?: string;
    writer?: StreamWriter;
  } = {}
): SSRContainer {
  return new SSRContainer({
    tagName: opts.tagName || 'div',
    writer: opts.writer || new StringBufferWriter(),
  });
}

class StringBufferWriter {
  private buffer = [] as string[];
  write(text: string) {
    this.buffer.push(text);
  }
  toString() {
    return this.buffer.join('');
  }
}

class SSRContainer implements ISSRContainer {
  public tag: string;
  public writer: StreamWriter;
  private stack: string[] = [];

  constructor(opts: Required<Required<Parameters<typeof ssrCreateContainer>>[0]>) {
    this.tag = opts.tagName;
    this.writer = opts.writer;
  }

  openContainer() {
    this.openElement(this.tag, [
      'q:container',
      'paused',
      'q:render',
      'static-ssr',
      'q:version',
      'dev',
      'q:base',
      '/build/',
      'q:locale',
      null,
      'q:manifest-hash',
      'dev',
    ]);
  }

  closeContainer(): void {
    this.closeElement();
  }

  openElement(tag: string, attrs: SsrAttrs) {
    this.write('<');
    this.write(tag);
    this.stack.push(tag);
    this.writeAttrs(attrs);
    this.write('>');
  }
  closeElement() {
    this.write('</');
    this.write(this.stack.pop()!);
    this.write('>');
  }

  text(text: string) {
    this.write(text);
  }

  ////////////////////////////////////
  private write(text: string) {
    this.writer.write(text);
  }

  private writeAttrs(attrs: (string | null)[]) {
    if (attrs.length) {
      for (let i = 0; i < attrs.length; i++) {
        const key = attrs[i++] as string;
        const value = attrs[i];
        this.write(' ');
        this.write(key);
        if (value !== null) {
          this.write('="');
          let startIdx = 0;
          let qouteIdx: number;
          while ((qouteIdx = value.indexOf('"', startIdx)) != -1) {
            this.write(value.substring(startIdx, qouteIdx));
            this.write('&quot;');
            startIdx = qouteIdx;
          }
          this.write(startIdx === 0 ? value : value.substring(startIdx));
          this.write('"');
        }
      }
    }
  }
}

export function toSsrAttrs(record: Record<string, Stringifyable>): SsrAttrs {
  const ssrAttrs: SsrAttrs = [];
  for (const key in record) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      ssrAttrs.push(key, String(record[key]));
    }
  }
  return ssrAttrs;
}

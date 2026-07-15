import { createSsrRecord, type SsrOutput, type SsrReferenceChunk } from '@qwik.dev/core';
import { escapeHTML, TypeIds } from './qwik-copy';
import { getQwikLoaderScript } from './scripts';
import type { QwikLoaderOptions } from './types';

type ScriptAttrValue = string | boolean | undefined;
const MAX_STATE_ROOTS_PER_SCRIPT = 1024;

interface SsrScriptEmitterOptions {
  debug?: boolean;
  nonce?: string;
  qwikLoader?: QwikLoaderOptions;
}

export class SsrScriptEmitter {
  constructor(private readonly opts: SsrScriptEmitterOptions = {}) {}

  emitState(
    serializedState: string,
    base: number,
    len: number,
    eventAttrParts?: readonly (string | SsrReferenceChunk)[]
  ): SsrOutput {
    if (len > MAX_STATE_ROOTS_PER_SCRIPT) {
      const state = JSON.parse(serializedState) as unknown[];
      const hasForwardRefs = state[(len - 1) * 2] === TypeIds.ForwardRefs;
      const rootLen = hasForwardRefs ? len - 1 : len;
      const output: SsrOutput[] = [];
      for (let offset = 0; offset < rootLen; offset += MAX_STATE_ROOTS_PER_SCRIPT) {
        const chunkLen = Math.min(MAX_STATE_ROOTS_PER_SCRIPT, rootLen - offset);
        const start = offset * 2;
        const end = start + chunkLen * 2;
        output.push(
          this.emitStateChunk(
            JSON.stringify(state.slice(start, end)),
            base + offset,
            chunkLen,
            false,
            offset === 0 ? eventAttrParts : undefined
          )
        );
      }
      if (hasForwardRefs) {
        output.push(
          this.emitStateChunk(JSON.stringify(state.slice(rootLen * 2)), base + rootLen, 1, true)
        );
      }
      return output;
    }

    return this.emitStateChunk(serializedState, base, len, false, eventAttrParts);
  }

  private emitStateChunk(
    serializedState: string,
    base: number,
    len: number,
    forwardRefs = false,
    eventAttrParts?: readonly (string | SsrReferenceChunk)[]
  ): SsrOutput {
    const attrs = {
      type: 'qwik/state',
      'q:base': String(base),
      'q:len': String(len),
      'q:fr': forwardRefs,
    };
    const body = escapeScript(serializedState);
    return eventAttrParts === undefined
      ? this.writeScript(attrs, body)
      : this.writeScript(attrs, body, eventAttrParts);
  }

  emitQwikLoader(): string {
    if (this.shouldSkipQwikLoader()) {
      return '';
    }
    return this.writeScript(
      {
        id: 'qwikloader',
        async: true,
        type: 'module',
        nonce: this.getNonce(),
      },
      getQwikLoaderScript({ debug: this.opts.debug })
    );
  }

  emitQwikEvents(eventNames: ReadonlySet<string>): string {
    if (eventNames.size === 0) {
      return '';
    }
    return this.writeScript(
      { nonce: this.getNonce() },
      `(window._qwikEv||(window._qwikEv=[])).push(${Array.from(eventNames, (eventName) =>
        JSON.stringify(eventName)
      ).join(',')})`
    );
  }

  private writeScript(attrs: Record<string, ScriptAttrValue>, body?: string): string;
  private writeScript(
    attrs: Record<string, ScriptAttrValue>,
    body: string,
    eventAttrParts: readonly (string | SsrReferenceChunk)[]
  ): SsrOutput;
  private writeScript(
    attrs: Record<string, ScriptAttrValue>,
    body: string = '',
    eventAttrParts?: readonly (string | SsrReferenceChunk)[]
  ): SsrOutput {
    const start = `<script${serializeScriptAttrs(attrs)}`;
    if (eventAttrParts === undefined || eventAttrParts.length === 0) {
      return `${start}>${body}</script>`;
    }
    if (eventAttrParts.every((part) => typeof part === 'string')) {
      return `${start}${eventAttrParts.join('')}>${body}</script>`;
    }
    return [createSsrRecord(start, ...eventAttrParts, '>'), `${body}</script>`];
  }

  private shouldSkipQwikLoader(): boolean {
    const qwikLoader = this.opts.qwikLoader;
    return (
      qwikLoader === 'never' || (typeof qwikLoader === 'object' && qwikLoader.include === 'never')
    );
  }

  private getNonce(): string | undefined {
    return this.opts.nonce;
  }
}

function escapeScript(value: string): string {
  return value.replace(/<\//g, '<\\/');
}

function serializeScriptAttrs(attrs: Record<string, ScriptAttrValue>): string {
  let output = '';
  for (const key in attrs) {
    const value = attrs[key];
    if (value === undefined || value === false) {
      continue;
    }
    output += value === true ? ` ${key}` : ` ${key}="${escapeHTML(String(value))}"`;
  }
  return output;
}

import {
  createSsrRecord,
  type SerializedStateRange,
  type SsrOutput,
  type SsrReferenceChunk,
} from '@qwik.dev/core';
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
    eventAttrParts?: readonly (string | SsrReferenceChunk)[],
    hasForwardRefs = false,
    boundaryId?: number
  ): SsrOutput {
    if (len > MAX_STATE_ROOTS_PER_SCRIPT || hasForwardRefs) {
      const state = JSON.parse(serializedState) as unknown[];
      const rootLen = len - (hasForwardRefs ? 1 : 0);
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
            offset === 0 ? eventAttrParts : undefined,
            boundaryId
          )
        );
      }
      if (hasForwardRefs) {
        output.push(
          this.emitStateChunk(
            JSON.stringify(state.slice(rootLen * 2)),
            base + rootLen,
            0,
            true,
            undefined,
            boundaryId
          )
        );
      }
      return output;
    }

    return this.emitStateChunk(serializedState, base, len, false, eventAttrParts, boundaryId);
  }

  emitStateRange(
    range: SerializedStateRange,
    boundaryId: number,
    subscriptions?: readonly number[]
  ): SsrOutput {
    const output: SsrOutput[] = [
      this.emitState(range.state, range.base, range.len, undefined, false, boundaryId),
    ];
    if (range.forwardRefs !== undefined) {
      const forwardRefs = range.forwardRefs.map((value) =>
        Array.isArray(value) ? value.join(' ') : value
      );
      output.push(
        this.emitStateChunk(
          JSON.stringify([TypeIds.ForwardRefs, forwardRefs]),
          range.base + range.len,
          0,
          true,
          undefined,
          boundaryId
        )
      );
    }
    if (subscriptions !== undefined && subscriptions.length > 0) {
      output.push(
        this.writeScript(
          {
            type: 'qwik/state',
            'q:s': String(boundaryId),
            'q:base': String(range.base + range.len),
            'q:len': '0',
            'q:sub': true,
          },
          escapeScript(JSON.stringify(subscriptions))
        )
      );
    }
    return output;
  }

  private emitStateChunk(
    serializedState: string,
    base: number,
    len: number,
    forwardRefs = false,
    eventAttrParts?: readonly (string | SsrReferenceChunk)[],
    boundaryId?: number
  ): SsrOutput {
    const attrs = {
      type: 'qwik/state',
      'q:s': boundaryId === undefined ? undefined : String(boundaryId),
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

  emitSuspenseRuntime(instanceHash: string): string {
    return this.writeScript(
      { nonce: this.getNonce() },
      `((w)=>{w._qwikS=(s,i,u,o)=>w._qwikSP=Promise.resolve(w._qwikSP).then(async()=>{const t=s.previousElementSibling,c=t.closest('[q\\\\:container]'),x=c&&c._ctx,z=n=>{let p=n.parentElement;while(p&&!p.hasAttribute('q:container'))p=p.parentElement;return p===c},h=async(r,m)=>{if(r<0)return;const e=[...c.querySelectorAll('script[type="qwik/state"]')].filter(z);for(let j=0;j<e.length;j++){const b=+e[j].getAttribute('q:base'),l=+e[j].getAttribute('q:len');if(r>=b&&r<b+l){const q=e[j].getAttribute('q:dispose');e[j].setAttribute('q:dispose',q?q+' '+r:''+r);break}}if(x)m?x.discardRoot(r):await x.disposeRoot(r)},e=[...c.querySelectorAll('script[type="qwik/state"][q\\\\:s="'+i+'"]')].filter(z);if(x)x.registerStateScripts(e);await h(o,0);const k=document.createTreeWalker(c,128);let a,n,d=0;while(n=k.nextNode()){if(!z(n))continue;const v=n.data;if(!a){if(v==='d='+i)a=n}else if(v.startsWith('d='))d++;else if(v==='/d'){if(d)d--;else break}}if(!a||!n){await h(u,1);t.remove();s.remove();return}const r=document.createRange();r.setStartAfter(a);r.setEndBefore(n);r.deleteContents();r.insertNode(t.content);if(x&&u>=0)await x.prepareRoot(u);t.remove();s.remove()});(w._qwikEv||(w._qwikEv=[])).push(0,${JSON.stringify(instanceHash)})})(window)`
    );
  }

  emitResolved(
    boundaryId: number,
    content: SsrOutput,
    contentRoot?: number,
    fallbackRoot?: number
  ): readonly [string, SsrOutput, string, string] {
    return [
      `<template q:s="${boundaryId}">`,
      content,
      '</template>',
      this.writeScript(
        { nonce: this.getNonce() },
        `window._qwikS(document.currentScript,${boundaryId},${contentRoot ?? -1},${fallbackRoot ?? -1})`
      ),
    ];
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

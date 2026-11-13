import type { SsrAttributePatch } from '@qwik.dev/core';
import {
  escapeScriptText,
  type SerializationContext,
  type SerializedStateRange,
} from '@qwik.dev/core/internal/serializer';
import { escapeHTML, QFuncsPrefix, TypeIds } from './qwik-copy';
import { getQwikLoaderScript } from './scripts';
import type { QwikLoaderOptions } from './types';

type ScriptAttrValue = string | boolean | undefined;

interface SsrScriptEmitterOptions {
  debug?: boolean;
  nonce?: string;
  qwikLoader?: QwikLoaderOptions;
}

export class SsrScriptEmitter {
  private hasBackpatchRuntime = false;

  constructor(private readonly opts: SsrScriptEmitterOptions = {}) {}

  /** Ranges are consecutive and each fits one script; the last carries the frame's forward refs. */
  emitStateRanges(
    ranges: readonly SerializedStateRange[],
    boundaryId?: number,
    subscriptions?: readonly number[],
    eventAttrs = ''
  ): string {
    if (ranges.length === 0) {
      return '';
    }
    const boundary = boundaryId === undefined ? undefined : String(boundaryId);
    let html = '';
    for (let i = 0; i < ranges.length; i++) {
      const range = ranges[i];
      html += this.writeScript(
        {
          type: 'qwik/state',
          'q:s': boundary,
          'q:base': String(range.base),
          'q:len': String(range.len),
        },
        // the serializer already escapes every script boundary
        range.state,
        i === 0 ? eventAttrs : ''
      );
    }
    const last = ranges[ranges.length - 1];
    const end = String(last.base + last.len);
    if (last.forwardRefs !== undefined) {
      const forwardRefs = last.forwardRefs.map((value) =>
        Array.isArray(value) ? value.join(' ') : value
      );
      html += this.writeScript(
        { type: 'qwik/state', 'q:s': boundary, 'q:base': end, 'q:len': '0', 'q:fr': true },
        stringifyScriptJson([TypeIds.ForwardRefs, forwardRefs])
      );
    }
    if (subscriptions !== undefined && subscriptions.length > 0) {
      html += this.writeScript(
        { type: 'qwik/state', 'q:s': boundary, 'q:base': end, 'q:len': '0', 'q:sub': true },
        stringifyScriptJson(subscriptions)
      );
    }
    return html;
  }

  /** Module mode loads the manifest's loader chunk from the head; without that chunk it inlines. */
  isQwikLoaderModule(bundle: string | undefined): boolean {
    return (
      !this.shouldSkipQwikLoader() && this.opts.qwikLoader !== 'inline' && bundle !== undefined
    );
  }

  emitQwikLoaderModule(src: string): string {
    const nonce = this.getNonce();
    return (
      `<link${serializeScriptAttrs({ rel: 'modulepreload', href: src, nonce })}>` +
      this.writeScript({ async: true, type: 'module', src, nonce })
    );
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
        stringifyScriptJson(eventName)
      ).join(',')})`
    );
  }

  /**
   * Sync handlers must be callable the moment their element is parsed, so the compiler places this
   * definition immediately before the element that references it.
   */
  emitSyncFn(key: string, source: string, instanceHash: string): string {
    const table = JSON.stringify(`${QFuncsPrefix}${instanceHash}`);
    return this.writeScript(
      // no `type`: the browser must execute this
      { 'q:func': 'qwik/json', nonce: this.getNonce() },
      escapeScriptText(`((d)=>{(d[${table}]??={})[${JSON.stringify(key)}]=${source}})(document)`)
    );
  }

  checkpoint(journal: NonNullable<SerializationContext['$journal$']>): void {
    const hadBackpatchRuntime = this.hasBackpatchRuntime;
    journal.record(() => {
      this.hasBackpatchRuntime = hadBackpatchRuntime;
    });
  }

  emitBackpatch(patches: readonly SsrAttributePatch[]): string {
    const apply = `const c=s.closest('[q\\\\:container]');if(!c)return;const z=e=>e.closest('[q\\\\:container]')===c;for(let i=0;i<d.length;i+=3){const e=[...c.querySelectorAll('[q\\\\:id="'+d[i]+'"]')].find(z),n=d[i+1],v=d[i+2];if(!e)continue;n==='value'&&e.value!==undefined?e.value=v??'':n==='checked'&&e.checked!==undefined?e.checked=v!==null:v==null?e.removeAttribute(n):e.setAttribute(n,v)}`;
    const install = this.hasBackpatchRuntime ? '' : `w._qwikB=(s,d)=>{${apply}};`;
    this.hasBackpatchRuntime = true;
    return this.writeScript(
      { nonce: this.getNonce() },
      `((s,w,d)=>{${install}const f=()=>w._qwikB(s,d);w._qwikSP?w._qwikSP=w._qwikSP.then(f):f()})(document.currentScript,window,${stringifyScriptJson(patches.flat())})`
    );
  }

  emitPendingRuntime(instanceHash: string): string {
    return this.writeScript(
      { nonce: this.getNonce() },
      `((w)=>{w._qwikS=(s,i,u,o)=>w._qwikSP=Promise.resolve(w._qwikSP).then(async()=>{const t=s.previousElementSibling,c=t.closest('[q\\\\:container]'),x=c&&c._ctx,z=n=>{let p=n.parentElement;while(p&&!p.hasAttribute('q:container'))p=p.parentElement;return p===c},e=[...c.querySelectorAll('script[type="qwik/state"]')].filter(z),h=async(r,m)=>{if(r<0)return;for(let j=0;j<e.length;j++){const b=+e[j].getAttribute('q:base'),l=+e[j].getAttribute('q:len');if(r>=b&&r<b+l){const q=e[j].getAttribute('q:dispose');e[j].setAttribute('q:dispose',q?q+' '+r:''+r);break}}if(x)m?x.discardRoot(r):await x.disposeRoot(r)},p=e.filter(e=>e.getAttribute('q:s')===''+i);if(x)x.registerStateScripts(p);await h(o,0);const k=document.createTreeWalker(c,128);let a,n,d=0;while(n=k.nextNode()){if(!z(n))continue;const v=n.data;if(!a){if(v==='d='+i)a=n}else if(v.startsWith('d='))d++;else if(v==='/d'){if(d)d--;else break}}if(!a||!n){await h(u,1);t.remove();s.remove();return}const r=document.createRange();r.setStartAfter(a);r.setEndBefore(n);r.deleteContents();r.insertNode(t.content);if(x&&u>=0)await x.prepareRoot(u);let v=0;for(let j=0;j<p.length;j++){const q=p[j].getAttribute('q:idle');if(q!==null){p[j].setAttribute('q-d:qidle',q);p[j].removeAttribute('q:idle');v=1}}if(v)(w._qwikEv||(w._qwikEv=[])).push('d:qidle');t.remove();s.remove()});(w._qwikEv||(w._qwikEv=[])).push(0,${stringifyScriptJson(instanceHash)})})(window)`
    );
  }

  emitResolved(
    boundaryId: number,
    content: string,
    disposePrevious: boolean,
    contentRoot?: number,
    fallbackRoot?: number
  ): readonly [string, string, string, string] {
    return [
      `<template q:s="${boundaryId}">`,
      content,
      '</template>',
      this.writeScript(
        { nonce: this.getNonce() },
        `window._qwikS(document.currentScript,${boundaryId},${contentRoot ?? -1},${disposePrevious ? (fallbackRoot ?? -1) : -1})`
      ),
    ];
  }

  private writeScript(attrs: Record<string, ScriptAttrValue>, body = '', eventAttrs = ''): string {
    return `<script${serializeScriptAttrs(attrs)}${eventAttrs}>${body}</script>`;
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

/** JSON only has `<` inside strings, so this keeps every script boundary. */
export function stringifyScriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003C');
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

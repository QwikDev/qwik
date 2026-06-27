import { escapeHTML } from '../../core/shared/utils/character-escaping';
import { TypeIds } from '../../core/shared/serdes/constants';
import { getQwikLoaderScript } from '../scripts';
import type { RenderToStreamOptions } from '../types';

type ScriptAttrValue = string | boolean | undefined;
const MAX_STATE_ROOTS_PER_SCRIPT = 1024;

export class SsrScriptEmitter {
  constructor(private opts: RenderToStreamOptions) {}

  async emitState(serializedState: string, base: number, len: number): Promise<void> {
    if (len > MAX_STATE_ROOTS_PER_SCRIPT) {
      const state = JSON.parse(serializedState) as unknown[];
      const hasForwardRefs = state[(len - 1) * 2] === TypeIds.ForwardRefs;
      const rootLen = hasForwardRefs ? len - 1 : len;
      for (let offset = 0; offset < rootLen; offset += MAX_STATE_ROOTS_PER_SCRIPT) {
        const chunkLen = Math.min(MAX_STATE_ROOTS_PER_SCRIPT, rootLen - offset);
        const start = offset * 2;
        const end = start + chunkLen * 2;
        await this.emitStateChunk(JSON.stringify(state.slice(start, end)), base + offset, chunkLen);
      }
      if (hasForwardRefs) {
        await this.emitStateChunk(
          JSON.stringify(state.slice(rootLen * 2)),
          base + rootLen,
          1,
          true
        );
      }
      return;
    }

    await this.emitStateChunk(serializedState, base, len);
  }

  private async emitStateChunk(
    serializedState: string,
    base: number,
    len: number,
    forwardRefs = false
  ): Promise<void> {
    await this.writeScript(
      { type: 'qwik/state', 'q:base': String(base), 'q:len': String(len), 'q:fr': forwardRefs },
      escapeScript(serializedState)
    );
  }

  async emitQwikLoader(): Promise<void> {
    if (this.shouldSkipQwikLoader()) {
      return;
    }
    await this.writeScript(
      {
        id: 'qwikloader',
        async: true,
        type: 'module',
        nonce: this.getNonce(),
      },
      getQwikLoaderScript({ debug: this.opts.debug })
    );
  }

  async emitQwikEvents(eventNames: ReadonlySet<string>): Promise<void> {
    if (eventNames.size === 0) {
      return;
    }
    await this.writeScript(
      { nonce: this.getNonce() },
      `(window._qwikEv||(window._qwikEv=[])).push(${Array.from(eventNames, (eventName) =>
        JSON.stringify(eventName)
      ).join(',')})`
    );
  }

  private async writeScript(
    attrs: Record<string, ScriptAttrValue>,
    body: string = ''
  ): Promise<void> {
    await this.opts.stream.write(`<script${serializeScriptAttrs(attrs)}>${body}</script>`);
  }

  private shouldSkipQwikLoader(): boolean {
    const qwikLoader = this.opts.qwikLoader;
    return (
      qwikLoader === 'never' || (typeof qwikLoader === 'object' && qwikLoader.include === 'never')
    );
  }

  private getNonce(): string | undefined {
    return this.opts.serverData?.nonce;
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

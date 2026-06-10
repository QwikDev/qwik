import { escapeHTML } from '../../core/shared/utils/character-escaping';
import { getQwikLoaderScript } from '../scripts';
import type { RenderToStreamOptions } from '../types';

type ScriptAttrValue = string | boolean | undefined;

export class SsrScriptEmitter {
  constructor(private opts: RenderToStreamOptions) {}

  async emitState(serializedState: string, base: number, len: number): Promise<void> {
    await this.writeScript(
      { type: 'qwik/state', 'q:base': String(base), 'q:len': String(len) },
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

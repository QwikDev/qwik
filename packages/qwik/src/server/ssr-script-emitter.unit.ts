import { describe, expect, it } from 'vitest';
import { TypeIds } from '../core/shared/serdes/constants';
import { isSsrRecordChunk, type SsrOutput } from '../core/ssr/output';
import { getQwikLoaderScript } from './scripts';
import { createSsrEventAttrParts } from './ssr-event-attr';
import { SsrScriptEmitter } from './ssr-script-emitter';
import { createDocument } from '../testing/document';

describe('SsrScriptEmitter', () => {
  it('produces state scripts synchronously with at most 1024 roots', () => {
    const emitter = new SsrScriptEmitter();
    const state = Array.from({ length: 1025 * 2 }, (_, i) => i);

    const output = emitter.emitState(JSON.stringify(state), 0, 1025);

    expect(output).not.toBeInstanceOf(Promise);
    const scripts = getScripts(output);
    expect(scripts).toHaveLength(2);
    expect(scripts[0]).toContain('q:base="0"');
    expect(scripts[0]).toContain('q:len="1024"');
    expect(JSON.parse(readScriptBody(scripts[0]))).toHaveLength(2048);
    expect(scripts[1]).toContain('q:base="1024"');
    expect(scripts[1]).toContain('q:len="1"');
    expect(JSON.parse(readScriptBody(scripts[1]))).toEqual([2048, 2049]);
  });

  it('emits forward refs as separate metadata without consuming a root id', () => {
    const emitter = new SsrScriptEmitter();
    const state = [TypeIds.Plain, 'root', TypeIds.ForwardRefs, [0]];

    const output = emitter.emitState(JSON.stringify(state), 0, 2, undefined, true);

    const scripts = getScripts(output);
    expect(scripts).toHaveLength(2);
    expect(scripts[0]).toContain('q:len="1"');
    expect(scripts[1]).toContain('q:base="1"');
    expect(scripts[1]).toContain('q:len="0"');
    expect(scripts[1]).toContain('q:fr');
    expect(JSON.parse(readScriptBody(scripts[1]))).toEqual([TypeIds.ForwardRefs, [0]]);
  });

  it('preserves loader and event script HTML with a nonce', () => {
    const emitter = new SsrScriptEmitter({ nonce: 'a"b' });
    const loader = getQwikLoaderScript();

    expect(emitter.emitQwikLoader()).toBe(
      `<script id="qwikloader" async type="module" nonce="a&quot;b">${loader ?? ''}</script>`
    );
    expect(emitter.emitQwikEvents(new Set(['click', 'keyup']))).toBe(
      '<script nonce="a&quot;b">(window._qwikEv||(window._qwikEv=[])).push("click","keyup")</script>'
    );
  });

  it('keeps qidle root references typed in the state script record', () => {
    const emitter = new SsrScriptEmitter();
    const eventAttrParts = createSsrEventAttrParts('q-d:qidle', ['resume#', 2]);

    const output = emitter.emitState('[]', 0, 1, eventAttrParts);

    expect(Array.isArray(output) && isSsrRecordChunk(output[0])).toBe(true);
    expect(output).toEqual([
      {
        type: 'record',
        parts: [
          '<script type="qwik/state" q:base="0" q:len="1"',
          ' q-d:qidle="resume#',
          { type: 'root-ref', localId: 2 },
          '"',
          '>',
        ],
      },
      '[]</script>',
    ]);
  });

  it('emits append-only packet state and forward refs for one boundary', () => {
    const emitter = new SsrScriptEmitter();
    const output = emitter.emitStateRange(
      {
        base: 4,
        len: 1,
        state: JSON.stringify([TypeIds.Plain, 'value']),
        forwardRefs: [4, [4, 1]],
      },
      7
    );

    const scripts = getScripts(output);
    expect(scripts).toHaveLength(2);
    expect(scripts[0]).toContain('q:s="7" q:base="4" q:len="1"');
    expect(scripts[1]).toContain('q:s="7" q:base="5" q:len="0" q:fr');
    expect(JSON.parse(readScriptBody(scripts[1]))).toEqual([TypeIds.ForwardRefs, [4, '4 1']]);
  });

  it('emits subscription edges as zero-root packet metadata', () => {
    const emitter = new SsrScriptEmitter();
    const output = emitter.emitStateRange(
      {
        base: 4,
        len: 1,
        state: JSON.stringify([TypeIds.Plain, 'value']),
      },
      7,
      [0, 4, 2, 4]
    );

    const scripts = getScripts(output);
    expect(scripts).toHaveLength(2);
    expect(scripts[1]).toContain('q:s="7" q:base="5" q:len="0" q:sub');
    expect(JSON.parse(readScriptBody(scripts[1]))).toEqual([0, 4, 2, 4]);
  });

  it('emits one nonce-protected runtime and a small resolved packet call', () => {
    const emitter = new SsrScriptEmitter({ nonce: 'packet' });
    const packet = emitter.emitResolved(7, '<p>content</p>', 8, 9);

    expect(packet[0]).toBe('<template q:s="7">');
    expect(packet[1]).toBe('<p>content</p>');
    expect(packet[2]).toBe('</template>');
    expect(packet[3]).toContain('<script nonce="packet">');
    expect(packet[3]).toBe(
      '<script nonce="packet">window._qwikS(document.currentScript,7,8,9)</script>'
    );
    const runtime = emitter.emitSuspenseRuntime('abc123');
    expect(runtime).toContain('<script nonce="packet">');
    expect(runtime).toContain("v==='d='+i");
    expect(runtime).toContain('prepareRoot(u)');
    expect(runtime).toContain('disposeRoot(r)');
    expect(runtime).toContain('.push(0,"abc123")');
  });

  it('executes the emitted range swap and fallback disposal protocol', async () => {
    const emitter = new SsrScriptEmitter();
    const document = createDocument({
      html: `<div q:container>
        <div q:container><!--d=7--><span id="nested">nested</span><!--/d-->
          <script type="qwik/state" q:s="7" q:base="8" q:len="1">[${TypeIds.Plain},null]</script>
        </div>
        <!--d=7--><span id="fallback">fallback</span><!--/d-->
        <script type="qwik/state" q:base="9" q:len="1">[${TypeIds.Plain},null]</script>
        <script type="qwik/state" q:s="7" q:base="8" q:len="1">[${TypeIds.Plain},null]</script>
        <template q:s="7"><p id="content">content</p></template><script id="packet"></script>
      </div>`,
    });
    const container = document.querySelector('[q\\:container]')! as HTMLElement & {
      _ctx?: unknown;
    };
    const calls: string[] = [];
    const querySelectorAll = container.querySelectorAll.bind(container);
    container._ctx = {
      registerStateScripts: () => calls.push('register'),
      discardRoot: () => calls.push('discard'),
      disposeRoot: async () => void calls.push('dispose'),
      prepareRoot: async () => void calls.push('prepare'),
    };
    const window = { _qwikEv: [] as unknown[] } as any;
    const runtime = emitter.emitSuspenseRuntime('instance');
    Function('window', 'document', readScriptBody(runtime))(window, document);

    window._qwikS(document.querySelector('#packet'), 7, 8, 9);
    await window._qwikSP;

    expect(container.querySelector('#fallback')).toBeFalsy();
    expect(container.querySelector('#content')?.textContent).toBe('content');
    expect(container.querySelector('#nested')?.textContent).toBe('nested');
    expect(calls).toEqual(['register', 'dispose', 'prepare']);
    expect(
      Array.from(querySelectorAll('script[type="qwik/state"]')).some(
        (script) => script.getAttribute('q:dispose') === '9'
      )
    ).toBe(true);
    expect(window._qwikEv).toEqual([0, 'instance']);

    const missingTemplate = document.createElement('template');
    const missingScript = document.createElement('script');
    Object.defineProperty(missingTemplate, 'closest', { value: () => container });
    container.appendChild(missingTemplate);
    container.appendChild(missingScript);
    window._qwikS(missingScript, 99, 8, -1);
    await window._qwikSP;

    expect(calls).toEqual(['register', 'dispose', 'prepare', 'register', 'discard']);
    expect(missingTemplate.parentElement).toBeNull();
    expect(missingScript.parentElement).toBeNull();
  });

  it.each(['never', { include: 'never' }] as const)(
    'omits the loader for %j configuration',
    (qwikLoader) => {
      expect(new SsrScriptEmitter({ qwikLoader }).emitQwikLoader()).toBe('');
    }
  );
});

function getScripts(output: SsrOutput): string[] {
  if (!Array.isArray(output) || output.some((chunk) => typeof chunk !== 'string')) {
    throw new Error('Expected literal script output.');
  }
  const html = output.join('');
  return html.match(/<script[^>]*>.*?<\/script>/g) ?? [];
}

function readScriptBody(script: string): string {
  return script.slice(script.indexOf('>') + 1, script.lastIndexOf('</script>'));
}

import { describe, expect, it } from 'vitest';
import { TypeIds } from '../core/shared/serdes/constants';
import { isSsrRecordChunk, type SsrOutput } from '../core/ssr/output';
import { getQwikLoaderScript } from './scripts';
import { createSsrEventAttrParts } from './ssr-event-attr';
import { SsrScriptEmitter } from './ssr-script-emitter';

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

  it('marks split forward refs state chunks', () => {
    const emitter = new SsrScriptEmitter();
    const state = [...Array.from({ length: 1024 * 2 }, (_, i) => i), TypeIds.ForwardRefs, [0]];

    const output = emitter.emitState(JSON.stringify(state), 0, 1025);

    const scripts = getScripts(output);
    expect(scripts).toHaveLength(2);
    expect(scripts[1]).toContain('q:base="1024"');
    expect(scripts[1]).toContain('q:len="1"');
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

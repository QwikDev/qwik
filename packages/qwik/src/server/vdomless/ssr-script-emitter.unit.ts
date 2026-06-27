import { describe, expect, it } from 'vitest';
import { TypeIds } from '../../core/shared/serdes/constants';
import { SsrScriptEmitter } from './ssr-script-emitter';
import type { RenderToStreamOptions } from '../types';

describe('SsrScriptEmitter', () => {
  it('emits state scripts with at most 1024 roots', async () => {
    const { emitter, html } = createEmitter();
    const state = Array.from({ length: 1025 * 2 }, (_, i) => i);

    await emitter.emitState(JSON.stringify(state), 0, 1025);

    const scripts = getScripts(html);
    expect(scripts).toHaveLength(2);
    expect(scripts[0]).toContain('q:base="0"');
    expect(scripts[0]).toContain('q:len="1024"');
    expect(JSON.parse(readScriptBody(scripts[0]))).toHaveLength(2048);
    expect(scripts[1]).toContain('q:base="1024"');
    expect(scripts[1]).toContain('q:len="1"');
    expect(JSON.parse(readScriptBody(scripts[1]))).toEqual([2048, 2049]);
  });

  it('marks split forward refs state chunks', async () => {
    const { emitter, html } = createEmitter();
    const state = [...Array.from({ length: 1024 * 2 }, (_, i) => i), TypeIds.ForwardRefs, [0]];

    await emitter.emitState(JSON.stringify(state), 0, 1025);

    const scripts = getScripts(html);
    expect(scripts).toHaveLength(2);
    expect(scripts[1]).toContain('q:base="1024"');
    expect(scripts[1]).toContain('q:len="1"');
    expect(scripts[1]).toContain('q:fr');
    expect(JSON.parse(readScriptBody(scripts[1]))).toEqual([TypeIds.ForwardRefs, [0]]);
  });
});

function createEmitter(): { emitter: SsrScriptEmitter; html: string[] } {
  const html: string[] = [];
  return {
    emitter: new SsrScriptEmitter({
      stream: {
        write(chunk: string) {
          html.push(chunk);
        },
      },
    } as RenderToStreamOptions),
    html,
  };
}

function getScripts(html: string[]): string[] {
  return html.join('').match(/<script[^>]*>.*?<\/script>/g) ?? [];
}

function readScriptBody(script: string): string {
  return script.slice(script.indexOf('>') + 1, script.lastIndexOf('</script>'));
}

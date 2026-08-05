import '@qwik.dev/core';
import { describe, expect, it, vi } from 'vitest';
import { _executeSsrChores } from '../shared/cursor/ssr-chore-execution';
import * as logUtils from '../shared/utils/log';
import { SsrNodeFlags } from '../shared/types';
import { ChoreBits } from '../shared/vnode/enums/chore-bits.enum';
import type { ISsrNode, SSRContainer } from '../ssr/ssr-types';

const STREAMED_CHORE_MESSAGE = 'A chore was scheduled on a host element';

function createStreamedNode(id: string): ISsrNode {
  // Streamed host: no Updatable flag, dirty bit that skips prop/compute and lands on the warn.
  return {
    id,
    flags: 0 as SsrNodeFlags,
    dirty: ChoreBits.TASKS,
    currentFile: `file-${id}.tsx`,
    toString: () => `<node ${id}>`,
  } as unknown as ISsrNode;
}

describe('_executeSsrChores streamed-host warning', () => {
  const container = {} as SSRContainer;

  it('warns once per host even when the same host is re-dirtied', () => {
    const warnSpy = vi.spyOn(logUtils, 'logWarn').mockImplementation(() => {});
    try {
      const node = createStreamedNode('a');
      _executeSsrChores(container, node);
      node.dirty = ChoreBits.TASKS;
      _executeSsrChores(container, node);

      const warnings = warnSpy.mock.calls.filter(([message]) =>
        String(message).includes(STREAMED_CHORE_MESSAGE)
      );
      expect(warnings).toHaveLength(1);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('warns once per distinct host', () => {
    const warnSpy = vi.spyOn(logUtils, 'logWarn').mockImplementation(() => {});
    try {
      _executeSsrChores(container, createStreamedNode('a'));
      _executeSsrChores(container, createStreamedNode('b'));

      const warnings = warnSpy.mock.calls.filter(([message]) =>
        String(message).includes(STREAMED_CHORE_MESSAGE)
      );
      expect(warnings).toHaveLength(2);
    } finally {
      warnSpy.mockRestore();
    }
  });
});

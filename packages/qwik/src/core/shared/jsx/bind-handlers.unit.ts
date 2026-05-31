import { describe, expect, it } from 'vitest';
import { _res, _chk, _val } from './bind-handlers';
import { createSignal } from '../../reactive-primitives/signal.public';
import { createDocument } from '@qwik.dev/core/testing';
import { QContainerAttr } from '../../shared/utils/markers';
import { setCaptures } from '../qrl/qrl-class';
import { TypeIds } from '../serdes/constants';
import { getDomContainer } from '../../client/dom-container';

describe('bind handlers', () => {
  describe('_res', () => {
    it('should handle being called with capture string without errors', () => {
      const document = createDocument();
      document.body.setAttribute(QContainerAttr, 'paused');
      const element = document.createElement('div');
      document.body.appendChild(element);

      // Simulate capture string format: "0 1" (root IDs)
      const captureString = '0 1';

      // Call _res as qwikloader would - should not throw
      expect(() => _res.call(captureString, null, element)).not.toThrow();
    });

    it('should handle being called without capture string (as QRL)', () => {
      const document = createDocument();
      document.body.setAttribute(QContainerAttr, 'paused');
      const element = document.createElement('div');
      document.body.appendChild(element);

      // Call _res without capture string (undefined this)
      expect(() => _res.call(undefined, null, element)).not.toThrow();
    });

    it('should be a true no-op (no side effects)', async () => {
      const document = createDocument();
      document.body.setAttribute(QContainerAttr, 'paused');
      const element = document.createElement('div');
      document.body.appendChild(element);

      const captureString = '0';

      // Call _res - it should do nothing visible
      const result = _res.call(captureString, null, element);

      // Resolves undefined (no-op) once VNodeData processing is ready.
      await expect(Promise.resolve(result)).resolves.toBeUndefined();
    });
  });

  describe('_chk', () => {
    it('should update signal with checkbox checked state', () => {
      const document = createDocument();
      document.body.setAttribute(QContainerAttr, 'paused');
      const element = document.createElement('input') as HTMLInputElement;
      element.type = 'checkbox';
      element.checked = true;
      document.body.appendChild(element);

      const signal = createSignal(false);

      // Manually set up captures for the test
      setCaptures([signal]);

      const captureString = undefined; // Captures already set

      _chk.call(captureString, null, element);

      expect(signal.value).toBe(true);
    });
  });

  describe('_val', () => {
    it('should keep delayed capture scopes isolated per queued event', async () => {
      const stateData = JSON.stringify([
        TypeIds.Object,
        [TypeIds.Plain, 'value', TypeIds.Plain, ''],
        TypeIds.Object,
        [TypeIds.Plain, 'value', TypeIds.Plain, ''],
      ]);
      const document = createDocument({
        html: `
          <html q:container="paused" q:locale="" q:base="" q:instance="" q:manifest-hash="">
            <body>
              <input id="first" />
              <input id="second" />
              <script type="qwik/state">${stateData}</script>
            </body>
          </html>
        `,
      });
      const firstInput = document.getElementById('first') as HTMLInputElement;
      const secondInput = document.getElementById('second') as HTMLInputElement;
      firstInput.value = 'first value';
      secondInput.value = 'second value';

      await withQueuedMacroTasks(async (tasks) => {
        const firstResult = _val.call('0', null, firstInput);
        const secondResult = _val.call('1', null, secondInput);

        expect(tasks).toHaveLength(1);
        drainTasks(tasks);
        await Promise.all([Promise.resolve(firstResult), Promise.resolve(secondResult)]);

        const container = getDomContainer(firstInput);
        expect((container.$getObjectById$(0) as { value: string }).value).toBe('first value');
        expect((container.$getObjectById$(1) as { value: string }).value).toBe('second value');
      });
    });

    it('should update signal with input value', () => {
      const document = createDocument();
      document.body.setAttribute(QContainerAttr, 'paused');
      const element = document.createElement('input') as HTMLInputElement;
      element.value = 'test value';
      document.body.appendChild(element);

      const signal = createSignal('');

      // Manually set up captures for the test
      setCaptures([signal]);

      const captureString = undefined; // Captures already set

      _val.call(captureString, null, element);

      expect(signal.value).toBe('test value');
    });

    it('should update signal with number input value', () => {
      const document = createDocument();
      document.body.setAttribute(QContainerAttr, 'paused');
      const element = document.createElement('input') as HTMLInputElement;
      element.type = 'number';
      element.valueAsNumber = 42;
      document.body.appendChild(element);

      const signal = createSignal(0);

      // Manually set up captures for the test
      setCaptures([signal]);

      const captureString = undefined; // Captures already set

      _val.call(captureString, null, element);

      expect(signal.value).toBe(42);
    });
  });
});

async function withQueuedMacroTasks(callback: (tasks: Array<() => void>) => Promise<void>) {
  const tasks: Array<() => void> = [];
  const originalMessageChannel = (globalThis as any).MessageChannel;

  class TestMessageChannel {
    port1 = {
      onmessage: null as null | (() => void),
      close() {},
    };
    port2 = {
      postMessage: () => {
        tasks.push(() => this.port1.onmessage?.());
      },
      close() {},
    };
  }

  try {
    Object.defineProperty(globalThis, 'MessageChannel', {
      configurable: true,
      value: TestMessageChannel,
    });
    await callback(tasks);
  } finally {
    Object.defineProperty(globalThis, 'MessageChannel', {
      configurable: true,
      value: originalMessageChannel,
    });
  }
}

function drainTasks(tasks: Array<() => void>) {
  let count = 0;
  while (tasks.length > 0) {
    tasks.shift()!();
    expect(++count).toBeLessThan(10);
  }
}

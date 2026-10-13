import { $ } from '@qwik.dev/core';
import { afterEach, describe, expect, it } from 'vitest';
import { _res, _chk, _val } from './bind-handlers';
import { createSignal } from '../../reactive-primitives/signal.public';
import { createAsyncSignal, createComputedSignal } from '../../reactive-primitives/signal-api';
import type { AsyncSignalImpl } from '../../reactive-primitives/impl/async-signal-impl';
import { ComputedSignalFlags } from '../../reactive-primitives/types';
import { createDocument } from '@qwik.dev/core/testing';
import { QContainerAttr, QInstanceAttr } from '../../shared/utils/markers';
import { setCaptures } from '../qrl/qrl-class';
import { TypeIds } from '../serdes/constants';
import { createSerializationContext } from '../serdes/serialization-context';
import { getDomContainer } from '../../client/dom-container';

const instanceId = 'bind-handlers-unit';

const createContainerDocument = () => {
  const document = createDocument();
  document.body.setAttribute(QContainerAttr, 'paused');
  document.body.setAttribute(QInstanceAttr, instanceId);
  return document;
};

const addStateRoots = (document: Document, ...roots: unknown[]) => {
  const state = document.createElement('script');
  state.setAttribute('type', 'qwik/state');
  state.setAttribute(QInstanceAttr, instanceId);
  state.textContent = JSON.stringify(roots.flatMap((root) => [TypeIds.Plain, root]));
  document.body.appendChild(state);
};

describe('bind handlers', () => {
  afterEach(() => {
    setCaptures(null);
  });

  describe('_res', () => {
    it('should start every client-only signal when compute QRLs replace captures', async () => {
      const document = createContainerDocument();
      const container = getDomContainer(document.body);
      const first = { calls: 0, value: 'layout data' };
      const second = { calls: 0, value: 'page data' };
      const firstCompute = $(async () => {
        first.calls++;
        return first.value;
      });
      const secondCompute = $(async () => {
        second.calls++;
        return second.value;
      });
      const firstSignal = createAsyncSignal(firstCompute, { container, clientOnly: true });
      const secondSignal = createAsyncSignal(secondCompute, { container, clientOnly: true });

      // Preloaded QRLs replace captures synchronously during computation
      await Promise.all([firstCompute.resolve(), secondCompute.resolve()]);
      setCaptures([firstSignal, secondSignal]);

      await _res.call(undefined, null, document.body);

      // Reading signal state here would start any skipped computations
      expect(first.calls).toBe(1);
      expect(second.calls).toBe(1);
      await Promise.all([firstSignal.promise(), secondSignal.promise()]);
      expect(firstSignal.value).toBe('layout data');
      expect(secondSignal.value).toBe('page data');
    });

    it('should resume every serialized client-only computed from capture deltas', async () => {
      const layout = { value: 'layout data' };
      const page = { value: 'page data' };
      const firstSignal = createComputedSignal(
        $(async () => layout.value),
        { clientOnly: true }
      );
      const secondSignal = createComputedSignal(
        $(async () => page.value),
        { clientOnly: true }
      );
      const serializationContext = createSerializationContext(
        null,
        null,
        () => '',
        () => {},
        new WeakMap()
      );
      const firstId = serializationContext.$addRoot$(firstSignal);
      const secondId = serializationContext.$addRoot$(secondSignal);
      await serializationContext.$serialize$();

      const document = createContainerDocument();
      const state = document.createElement('script');
      state.setAttribute('type', 'qwik/state');
      state.setAttribute(QInstanceAttr, instanceId);
      state.textContent = serializationContext.$writer$.toString();
      document.body.appendChild(state);

      await _res.call(`${firstId} ${secondId - firstId}`, null, document.body);

      const container = getDomContainer(document.body);
      const firstResumed = container.$getObjectById$(firstId) as AsyncSignalImpl<string>;
      const secondResumed = container.$getObjectById$(secondId) as AsyncSignalImpl<string>;
      // Assert startup before promise() can start skipped computations
      expect(firstResumed.$flags$ & ComputedSignalFlags.INVALID).toBe(0);
      expect(secondResumed.$flags$ & ComputedSignalFlags.INVALID).toBe(0);
      await Promise.all([firstResumed.promise(), secondResumed.promise()]);
      expect(firstResumed.value).toBe('layout data');
      expect(secondResumed.value).toBe('page data');
    });

    it('should handle being called with capture string without errors', () => {
      const document = createContainerDocument();
      const element = document.createElement('div');
      document.body.appendChild(element);
      addStateRoots(document, {}, {});

      // Simulate capture delta string format: first root id, then deltas.
      const captureString = '0 1';

      // Call _res as qwikloader would - should not throw
      expect(() => _res.call(captureString, null, element)).not.toThrow();
    });

    it('should handle being called without capture string (as QRL)', () => {
      const document = createContainerDocument();
      const element = document.createElement('div');
      document.body.appendChild(element);

      // Call _res without capture string (undefined this)
      expect(() => _res.call(undefined, null, element)).not.toThrow();
    });

    it('should be a true no-op (no side effects)', async () => {
      const document = createContainerDocument();
      const element = document.createElement('div');
      document.body.appendChild(element);
      addStateRoots(document, {});

      const captureString = '0';

      // Call _res - it should do nothing visible
      const result = _res.call(captureString, null, element);

      // Resolves undefined (no-op) once VNodeData processing is ready.
      await expect(Promise.resolve(result)).resolves.toBeUndefined();
    });
  });

  describe('_chk', () => {
    it('should update signal with checkbox checked state', () => {
      const document = createContainerDocument();
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
      const document = createContainerDocument();
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

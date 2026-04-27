import { afterEach, expect, test, vi } from 'vitest';
import { createMacroTask } from './next-tick';

const originalMessageChannel = globalThis.MessageChannel;

afterEach(() => {
  Object.assign(globalThis, {
    MessageChannel: originalMessageChannel,
  });
});

test('createMacroTask can close its MessageChannel', () => {
  const channels: TestMessageChannel[] = [];
  class TestMessageChannel {
    port1 = {
      onmessage: null as null | (() => void),
      close: vi.fn(),
    };
    port2 = {
      postMessage: vi.fn(() => this.port1.onmessage?.()),
      close: vi.fn(),
    };
    constructor() {
      channels.push(this);
    }
  }
  Object.assign(globalThis, {
    MessageChannel: TestMessageChannel,
  });

  const callback = vi.fn();
  const macroTask = createMacroTask(callback);
  const channel = channels[0];

  macroTask();
  expect(callback).toHaveBeenCalledTimes(1);
  expect(channel.port2.postMessage).toHaveBeenCalledTimes(1);

  macroTask.$destroy$!();
  macroTask();

  expect(channel.port1.close).toHaveBeenCalledTimes(1);
  expect(channel.port2.close).toHaveBeenCalledTimes(1);
  expect(channel.port2.postMessage).toHaveBeenCalledTimes(1);
  expect(callback).toHaveBeenCalledTimes(1);
});

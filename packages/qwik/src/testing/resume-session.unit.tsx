import { component$, useComputed$, useSignal } from '@qwik.dev/core';
import { getPlatform, setPlatform } from '@qwik.dev/core/internal';
import { afterEach, expect, it, vi } from 'vitest';
import { createDOM, testTarget } from './index';
import {
  createResumeModuleImporter,
  createResumeSymbolMapper,
  getResumeRegistry,
  TEST_RESUME_IMPORTER,
  type TestResumeTransformMetadata,
} from './resume-session';

const Counter = component$(() => {
  const count = useSignal(0);
  return <button onClick$={() => count.value++}>{count.value}</button>;
});

const ComputedCounter = component$(() => {
  const count = useSignal(0);
  const doubled = useComputed$(() => count.value * 2);
  return <button onClick$={() => count.value++}>{doubled.value}</button>;
});

const failRender = (): never => {
  throw new Error('render failed');
};

const Broken = component$(() => failRender());

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
});

it('receives resume metadata and the active Vite importer in the worker', async () => {
  const registry = getResumeRegistry();
  const metadata = Array.from(registry.values()).find(hasEventHandler);

  expect(testTarget).toBe('resume');
  expect(metadata).toBeDefined();
  expect(metadata?.server.length).toBeGreaterThan(0);
  const moduleImport = (globalThis as any)[TEST_RESUME_IMPORTER];
  expect(moduleImport).toBeTypeOf('function');
  await expect(moduleImport('@qwik.dev/core')).resolves.toHaveProperty('component$');
});

it('maps symbols and imports only registered client modules', async () => {
  const metadata = Array.from(getResumeRegistry().values()).find(hasEventHandler)!;
  const eventModule = metadata.client.find((module) => module.segment?.ctxKind === 'eventHandler')!;
  const moduleImport = vi.fn(async (id: string) => ({ id }));
  const importModule = createResumeModuleImporter([metadata], moduleImport);

  expect(createResumeSymbolMapper([metadata])(eventModule.segment!.name)).toEqual([
    eventModule.segment!.name,
    eventModule.path,
  ]);
  await expect(importModule(eventModule.path)).resolves.toEqual({ id: eventModule.path });
  expect(moduleImport).toHaveBeenCalledWith(eventModule.path);
  await expect(importModule('/unregistered/module.js')).rejects.toThrow('not registered');
  await expect(importModule('data:text/javascript,export default 1')).rejects.toThrow(
    'Unsupported test module protocol'
  );
});

it('resumes events and restores the previous platform on cleanup', async () => {
  const previousPlatform = getPlatform();
  const sentinelPlatform = { ...previousPlatform, isServer: true };
  setPlatform(sentinelPlatform);
  const harness = await createDOM();
  cleanups.push(() => {
    harness.cleanup();
    setPlatform(previousPlatform);
  });

  await harness.render(Counter);
  expect(getPlatform()).not.toBe(sentinelPlatform);
  await harness.userEvent('button', 'click');
  expect(harness.screen.querySelector('button')?.textContent).toBe('1');

  harness.cleanup();
  expect(getPlatform()).toBe(sentinelPlatform);
});

it('resumes computed subscribers', async () => {
  const harness = await createDOM();
  cleanups.push(harness.cleanup);

  await harness.render(ComputedCounter);
  await harness.userEvent('button', 'click');
  expect(harness.screen.querySelector('button')?.textContent).toBe('2');
});

it('restores the previous platform when SSR fails', async () => {
  const previousPlatform = getPlatform();
  const sentinelPlatform = { ...previousPlatform, isServer: true };
  setPlatform(sentinelPlatform);
  const harness = await createDOM();
  cleanups.push(() => setPlatform(previousPlatform));

  await expect(harness.render(Broken)).rejects.toThrow('render failed');
  expect(getPlatform()).toBe(sentinelPlatform);
});

it('prints Vite transforms, HTML, and serialized state with debug enabled', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const harness = await createDOM();
  cleanups.push(() => {
    harness.cleanup();
    log.mockRestore();
  });

  await harness.render(Counter, { debug: true });
  const output = log.mock.calls.flat().join('\n');
  const serializedState = harness.screen.querySelector('script[type="qwik/state"]')?.textContent;

  expect(output).toContain('SSR TRANSFORM');
  expect(output).toContain('CLIENT SEGMENTS');
  expect(output).toContain('HTML');
  expect(output).toContain('SERIALIZED STATE');
  expect(serializedState).toBeTruthy();
  expect(output).toContain(serializedState!);
});

function hasEventHandler(metadata: TestResumeTransformMetadata): boolean {
  return metadata.client.some((module) => module.segment?.ctxKind === 'eventHandler');
}

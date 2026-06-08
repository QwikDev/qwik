import { component$, useSignal } from '@qwik.dev/core';
import { routeLoader$ } from '@qwik.dev/router';
import { useImportedAlwaysLoader, useImportedNeverLoader } from './imported-loaders';

export { useImportedAlwaysLoader, useImportedNeverLoader } from './imported-loaders';

export const useTestLoader = routeLoader$(() => {
  return { test: 'some test value', abcd: 'should not serialize this' };
});

export const useTestLoaderEager = routeLoader$(
  () => {
    return { foo: 'some eager test value', bar: 'should serialize this' };
  },
  { serializationStrategy: 'always' }
);

export const useNestedLoader = routeLoader$(async (requestEv) => {
  const testData = await requestEv.resolveValue(useTestLoader);
  return { test: testData.test + ' nested', abcd: testData.abcd + ' nested' };
});

export default component$(() => {
  const testSignal = useTestLoader();
  const eagerSignal = useTestLoaderEager();
  const importedNever = useImportedNeverLoader();
  const importedAlways = useImportedAlwaysLoader();
  const toggle = useSignal(false);
  const toggleImported = useSignal(false);
  return (
    <>
      {testSignal.value.test}
      {/* Read eager signal in default render path so it's computed + serialized during SSR */}
      <span id="eager-ssr">{eagerSignal.value.foo}</span>
      <span id="imported-never-ssr">{importedNever.value?.value ?? 'missing'}</span>
      <span id="imported-always-ssr">{importedAlways.value?.value ?? 'missing'}</span>
      <button id="toggle-child" onClick$={() => (toggle.value = !toggle.value)}>
        toggle child
      </button>
      <button
        id="toggle-imported-child"
        onClick$={() => (toggleImported.value = !toggleImported.value)}
      >
        toggle imported child
      </button>
      {toggle.value && <Child />}
      {toggle.value && <ChildEager />}
      {toggle.value && <NestedChild />}
      {toggleImported.value && <ImportedNeverChild />}
      {toggleImported.value && <ImportedAlwaysChild />}
    </>
  );
});

export const Child = component$(() => {
  const testSignal = useTestLoader();
  return (
    <>
      <div id="prop1">{testSignal.value.test}</div>
      <div id="prop2">{testSignal.value.abcd}</div>
    </>
  );
});

export const ChildEager = component$(() => {
  const testSignal = useTestLoaderEager();
  return (
    <>
      <div id="prop3">{testSignal.value.foo}</div>
      <div id="prop4">{testSignal.value.bar}</div>
    </>
  );
});

export const NestedChild = component$(() => {
  const testSignal = useNestedLoader();
  return (
    <>
      <div id="prop5">{testSignal.value.test}</div>
      <div id="prop6">{testSignal.value.abcd}</div>
    </>
  );
});

export const ImportedNeverChild = component$(() => {
  const imported = useImportedNeverLoader();
  return <div id="imported-never-child">{imported.value?.value ?? 'missing'}</div>;
});

export const ImportedAlwaysChild = component$(() => {
  const imported = useImportedAlwaysLoader();
  return <div id="imported-always-child">{imported.value?.value ?? 'missing'}</div>;
});

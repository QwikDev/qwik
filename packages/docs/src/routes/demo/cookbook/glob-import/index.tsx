import { component$, type Component } from '@qwik.dev/core';

const metaGlobComponents = import.meta.glob<Component>(
  '/src/routes/demo/cookbook/glob-import/examples/*',
  { import: 'default' }
);

export default component$(() => {
  return (
    <div>
      <MetaGlobExample name="example1" />
      <MetaGlobExample name="example2" />
      <MetaGlobExample name="example3" />
    </div>
  );
});

const loaded: Record<string, Component> = {};
export const MetaGlobExample = component$<{ name: string }>(({ name }) => {
  const Cmp = loaded[name];
  if (!Cmp) {
    const componentPath = `/src/routes/demo/cookbook/glob-import/examples/${name}.tsx`;
    const promise = metaGlobComponents[componentPath]();
    throw promise.then((c) => (loaded[name] = c));
  }

  return <Cmp />;
});

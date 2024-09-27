import {
  type Component,
  component$,
  useSignal,
  useTask$,
} from '@qwikdev/core';
import { isDev } from '@qwikdev/core/build';

const metaGlobComponents: Record<string, any> = import.meta.glob(
  '/src/routes/demo/cookbook/glob-import/examples/*',
  {
    import: 'default',
    eager: isDev ? false : true,
  }
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

export const MetaGlobExample = component$<{ name: string }>(({ name }) => {
  const MetaGlobComponent = useSignal<Component<any>>();
  const componentPath = `/src/routes/demo/cookbook/glob-import/examples/${name}.tsx`;

  useTask$(async () => {
    MetaGlobComponent.value = isDev
      ? await metaGlobComponents[componentPath]() // We need to call `await metaGlobComponents[componentPath]()` in development as it is `eager:false`
      : metaGlobComponents[componentPath]; // We need to directly access the `metaGlobComponents[componentPath]` expression in preview/production as it is `eager:true`
  });

  return <>{MetaGlobComponent.value && <MetaGlobComponent.value />}</>;
});

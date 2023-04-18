import {
  component$,
  useStore,
  useSignal,
  noSerialize,
  useVisibleTask$,
  type NoSerialize,
} from '@builder.io/qwik';
import * as monaco from './monaco';

export default component$(() => {
  const editorRef = useSignal<HTMLElement>();
  const store = useStore<{ monacoInstance: NoSerialize<any> }>({
    monacoInstance: undefined,
  });

  useVisibleTask$(() => {
    const editor = monaco.editor.create(editorRef.value!, {
      value: 'Hello, world!',
    });
    // Monaco is not serializable, so we can't serialize it as part of SSR
    // We can however instantiate it on the client after the component is visible
    store.monacoInstance = noSerialize(editor);
  });
  return <div ref={editorRef} />;
});

import {
  component$,
  type NoSerialize,
  type QRL,
  useVisibleTask$,
  useContext,
  useSignal,
  useStore,
  useTask$,
} from '@builder.io/qwik';
import type { IStandaloneCodeEditor } from './monaco';
import {
  addQwikLibs,
  getEditorTheme,
  type ICodeEditorViewState,
  initMonacoEditor,
  updateMonacoEditor,
} from './monaco';
import type { ReplAppInput, ReplStore } from './types';
import { GlobalStore } from '../context';

export const Editor = component$((props: EditorProps) => {
  const hostRef = useSignal<Element>();

  const store = useStore<EditorStore>({
    editor: undefined,
    onChangeDebounce: undefined,
    onChangeSubscription: undefined,
    viewStates: {},
  });

  const globalStore = useContext(GlobalStore);

  useVisibleTask$(async () => {
    if (!store.editor) {
      await initMonacoEditor(hostRef.value, props, store, props.store);
    }
    return () => {
      if (store.editor) {
        store.editor.dispose();
      }
    };
  });

  useVisibleTask$(({ track }) => {
    track(() => globalStore.theme);
    if (globalStore.theme !== 'auto') {
      store.editor?.updateOptions({
        theme: getEditorTheme(globalStore.theme === 'dark'),
      });
    }
  });

  useTask$(async ({ track }) => {
    const v = track(() => props.input.version);
    track(() => store.editor);

    if (v && store.editor) {
      await addQwikLibs(v);
    }
  });

  useTask$(async ({ track }) => {
    track(() => store.editor);
    track(() => props.input.version);
    track(() => props.input.files);
    track(() => props.store.selectedInputPath);

    if (props.input.version && store.editor) {
      await updateMonacoEditor(props, store);
    }
  });

  return <div ref={hostRef} class="editor-container" />;
});

export interface EditorProps {
  input: ReplAppInput;
  ariaLabel: string;
  lineNumbers: 'on' | 'off';
  onChange$: QRL<(path: string, code: string) => void>;
  wordWrap: 'on' | 'off';
  store: ReplStore;
}

export interface EditorStore {
  editor: NoSerialize<IStandaloneCodeEditor>;
  onChangeDebounce: NoSerialize<any>;
  onChangeSubscription: NoSerialize<any>;
  viewStates: Record<string, NoSerialize<ICodeEditorViewState>>;
}

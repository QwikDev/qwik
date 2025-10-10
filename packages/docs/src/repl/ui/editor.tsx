import {
  component$,
  useSignal,
  useStore,
  useTask$,
  useVisibleTask$,
  type NoSerialize,
  type QRL,
} from '@qwik.dev/core';
import { getThemeSignal } from '../../components/theme-toggle/theme-toggle';
import type { ReplAppInput, ReplStore } from '../types';
import type { IStandaloneCodeEditor } from './monaco';
import {
  addQwikLibs,
  getEditorTheme,
  initMonacoEditor,
  updateMonacoEditor,
  type ICodeEditorViewState,
} from './monaco';

export const Editor = component$((props: EditorProps) => {
  const hostRef = useSignal<Element>();

  const store = useStore<EditorStore>({
    editor: undefined,
    onChangeDebounce: undefined,
    onChangeSubscription: undefined,
    viewStates: {},
  });

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
    const theme = track(getThemeSignal());
    store.editor?.updateOptions({
      theme: getEditorTheme(theme === 'dark'),
    });
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

import {
  component$,
  NoSerialize,
  PropFunction,
  useClientEffect$,
  useRef,
  useStore,
  useWatch$,
} from '@builder.io/qwik';
import type { IStandaloneCodeEditor } from './monaco';
import { addQwikLibs, ICodeEditorViewState, initMonacoEditor, updateMonacoEditor } from './monaco';
import type { ReplAppInput, ReplStore } from './types';

export const Editor = component$((props: EditorProps) => {
  const hostRef = useRef();

  const store = useStore<EditorStore>({
    editor: undefined,
    onChangeDebounce: undefined,
    onChangeSubscription: undefined,
    viewStates: {},
  });

  useClientEffect$(async () => {
    if (!store.editor) {
      await initMonacoEditor(hostRef.current, props, store, props.store);
    }
    return () => {
      if (store.editor) {
        store.editor.dispose();
      }
    };
  });

  useWatch$(async ({ track }) => {
    track(() => props.input.version);
    track(() => store.editor);

    if (props.input.version && store.editor) {
      await addQwikLibs(props.input.version);
    }
  });

  useWatch$(async ({ track }) => {
    track(() => store.editor);
    track(() => props.input.version);
    track(() => props.input.files);
    track(() => props.store.selectedInputPath);

    if (props.input.version && store.editor) {
      await updateMonacoEditor(props, store);
    }
  });

  return <div ref={hostRef} className="editor-container" />;
});

export interface EditorProps {
  input: ReplAppInput;
  ariaLabel: string;
  lineNumbers: 'on' | 'off';
  onChange$: PropFunction<(path: string, code: string) => void>;
  wordWrap: 'on' | 'off';
  store: ReplStore;
}

export interface EditorStore {
  editor: NoSerialize<IStandaloneCodeEditor>;
  onChangeDebounce: NoSerialize<any>;
  onChangeSubscription: NoSerialize<any>;
  viewStates: Record<string, NoSerialize<ICodeEditorViewState>>;
}

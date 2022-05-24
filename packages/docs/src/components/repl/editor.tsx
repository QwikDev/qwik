import {
  component$,
  Host,
  useHostElement,
  useStore,
  NoSerialize,
  useClientEffect$,
  QRL,
  useWatch$,
} from '@builder.io/qwik';
import type { TransformModuleInput } from '@builder.io/qwik/optimizer';
import { addQwikLibs, ICodeEditorViewState, initMonacoEditor, updateMonacoEditor } from './monaco';
import type { IStandaloneCodeEditor } from './monaco';
import type { ReplStore } from './types';

export const Editor = component$((props: EditorProps) => {
  const hostElm = useHostElement() as HTMLElement;

  const store = useStore<EditorStore>({
    editor: undefined,
    onChangeDebounce: undefined,
    onChangeSubscription: undefined,
    viewStates: {},
  });

  useClientEffect$(async () => {
    if (!store.editor) {
      await initMonacoEditor(hostElm, props, store, props.store);
    }
    return () => {
      if (store.editor) {
        store.editor.dispose();
      }
    };
  });

  useWatch$(async (track) => {
    track(props, 'version');
    track(store, 'editor');

    if (props.version && store.editor) {
      await addQwikLibs(props.version);
    }
  });

  useWatch$(async (track) => {
    track(props, 'version');
    track(store, 'editor');
    track(props, 'inputs');
    track(props, 'selectedPath');

    if (props.version && store.editor) {
      await updateMonacoEditor(props, store);
    }
  });

  return <Host className="editor-container" />;
});

export interface EditorProps {
  ariaLabel: string;
  inputs: TransformModuleInput[];
  lineNumbers: 'on' | 'off';
  onChangeQrl?: QRL<(path: string, code: string) => void>;
  selectedPath: string;
  wordWrap: 'on' | 'off';
  version: string;
  store: ReplStore;
}

export interface EditorStore {
  editor: NoSerialize<IStandaloneCodeEditor>;
  onChangeDebounce: NoSerialize<any>;
  onChangeSubscription: NoSerialize<any>;
  viewStates: Record<string, NoSerialize<ICodeEditorViewState>>;
}

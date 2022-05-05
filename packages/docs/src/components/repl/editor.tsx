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
import { addQwikLib, ICodeEditorViewState, initMonacoEditor, updateMonacoEditor } from './monaco';
import type { IStandaloneCodeEditor } from './monaco';

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
      await initMonacoEditor(hostElm, props, store);
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
      await addQwikLib(props.version);
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
  readOnly: boolean;
  selectedPath: string;
  wordWrap: 'on' | 'off';
  version: string;
}

export interface EditorStore {
  editor: NoSerialize<IStandaloneCodeEditor>;
  onChangeDebounce: NoSerialize<any>;
  onChangeSubscription: NoSerialize<any>;
  viewStates: Record<string, NoSerialize<ICodeEditorViewState>>;
}

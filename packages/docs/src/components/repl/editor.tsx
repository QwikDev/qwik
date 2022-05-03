import {
  component$,
  Host,
  useHostElement,
  useStore,
  NoSerialize,
  noSerialize,
  useClientEffect$,
} from '@builder.io/qwik';
import type { TransformModuleInput } from '@builder.io/qwik/optimizer';
import { ICodeEditorViewState, initMonacoEditor, updateMonacoEditor } from './monaco';
import type { IStandaloneCodeEditor } from './monaco';

export const Editor = component$((props: EditorProps) => {
  const hostElm = useHostElement() as HTMLElement;

  const store = useStore<EditorStore>({
    editor: undefined,
    onChangeDebounce: undefined,
    onChangeSubscription: undefined,
    viewStates: noSerialize({}),
  });

  useClientEffect$(async (track) => {
    track(store, 'editor');
    track(props, 'inputs');
    track(props, 'selectedPath');
    track(props, 'version');

    if (props.version) {
      if (!store.editor) {
        await initMonacoEditor(hostElm, props, store);
      }
      await updateMonacoEditor(props, store);
    }
  });

  // useCleanup$(() => {
  //   // TODO!
  //   if (store.editor) {
  //     store.editor.dispose();
  //   }
  // });

  return <Host className="editor-container" />;
});

export interface EditorProps {
  ariaLabel: string;
  inputs: TransformModuleInput[];
  lineNumbers: 'on' | 'off';
  onChange?: (path: string, code: string) => void;
  readOnly: boolean;
  selectedPath: string;
  wordWrap: 'on' | 'off';
  version: string;
}

export interface EditorStore {
  editor: NoSerialize<IStandaloneCodeEditor>;
  onChangeDebounce: NoSerialize<any>;
  onChangeSubscription: NoSerialize<any>;
  viewStates: NoSerialize<Record<string, ICodeEditorViewState>>;
}

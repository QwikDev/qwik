import {
  component$,
  Host,
  useEffect$,
  useHostElement,
  useStore,
  NoSerialize,
  noSerialize,
} from '@builder.io/qwik';
import type { TransformModuleInput } from '@builder.io/qwik/optimizer';
import { ICodeEditorViewState, initMonacoEditor, updateMonacoEditor } from './monaco';
import type { IStandaloneCodeEditor } from './monaco';
import { isBrowser } from '@builder.io/qwik/build';

export const Editor = component$((props: EditorProps) => {
  const hostElm = useHostElement() as HTMLElement;

  const store = useStore<EditorStore>({
    editor: undefined,
    onChangeDebounce: undefined,
    onChangeSubscription: undefined,
    viewStates: noSerialize({}),
    load: false,
  });

  useEffect$(async (track) => {
    track(store, 'load'); // TODO

    if (isBrowser) {
      await initMonacoEditor(hostElm, props, store);
    }
  });

  useEffect$(async (track) => {
    track(store, 'editor');
    track(props, 'inputs');
    track(props, 'selectedPath');

    if (isBrowser) {
      await updateMonacoEditor(props, store);
    }
  });

  // useCleanup$(() => {
  //   // TODO!
  //   if (store.editor) {
  //     store.editor.dispose();
  //   }
  // });

  return (
    <Host
      className="editor-container"
      on-qVisible$={() => {
        store.load = true;
      }}
    />
  );
});

export interface EditorProps {
  ariaLabel: string;
  inputs: TransformModuleInput[];
  lineNumbers: 'on' | 'off';
  onChange?: (path: string, code: string) => void;
  readOnly: boolean;
  selectedPath: string;
  wordWrap: 'on' | 'off';
  qwikVersion: string;
}

export interface EditorStore {
  editor: NoSerialize<IStandaloneCodeEditor>;
  onChangeDebounce: NoSerialize<any>;
  onChangeSubscription: NoSerialize<any>;
  viewStates: NoSerialize<Record<string, ICodeEditorViewState>>;
  load: boolean;
}

import { noSerialize } from '@builder.io/qwik';
import e from 'express';
import type MonacoTypes from 'monaco-editor';
import type { EditorProps, EditorStore } from './editor';

export const initMonacoEditor = async (
  containerElm: any,
  props: EditorProps,
  store: EditorStore
) => {
  const monaco = await getMonaco();
  const ts = monaco.languages.typescript;

  ts.typescriptDefaults.setCompilerOptions({
    allowJs: true,
    allowNonTsExtensions: true,
    esModuleInterop: true,
    isolatedModules: true,
    jsx: ts.JsxEmit.ReactJSX,
    jsxImportSource: '@builder.io/qwik',
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.Latest,
    typeRoots: ['node_modules/@types'],
  });

  ts.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: false,
  });

  ts.javascriptDefaults.setCompilerOptions({
    target: ts.ScriptTarget.ESNext,
    allowNonTsExtensions: true,
  });

  const editor = monaco.editor.create(containerElm, {
    ...defaultEditorOpts,
    ariaLabel: props.ariaLabel,
    lineNumbers: props.lineNumbers,
    readOnly: props.readOnly,
    wordWrap: props.wordWrap,
    model: null,
  });

  ts.typescriptDefaults.setEagerModelSync(true);

  if (!props.readOnly && typeof props.onChangeQrl === 'object') {
    store.onChangeSubscription = noSerialize(
      editor.onDidChangeModelContent(() => {
        props.onChangeQrl?.invoke(props.selectedPath, editor.getValue());
      })
    );
  }

  store.editor = noSerialize(editor);
};

export const addQwikLib = async (version: string) => {
  const monaco = await getMonaco();
  const typescriptDefaults = monaco.languages.typescript.typescriptDefaults;
  const deps = await loadDeps(version);

  deps.forEach((dep) => {
    typescriptDefaults.addExtraLib(dep.code!, `file://${dep.fsPath}`);
  });
};

export const updateMonacoEditor = async (props: EditorProps, store: EditorStore) => {
  const monaco = await getMonaco();

  const fsPaths = props.inputs.map((i) => getUri(monaco, i.path).fsPath);
  const existingModels = monaco.editor.getModels();
  for (const existingModel of existingModels) {
    try {
      if (!fsPaths.some((fsPath) => existingModel.uri.fsPath === fsPath)) {
        existingModel.dispose();
      }
    } catch (e) {
      console.error(existingModel.uri.fsPath, e);
    }
  }

  for (const input of props.inputs) {
    try {
      const uri = getUri(monaco, input.path);
      const existingModel = monaco.editor.getModel(uri);
      if (!existingModel) {
        monaco.editor.createModel(input.code, undefined, uri);
      }
    } catch (e) {
      console.error(input.path, e);
    }
  }

  const selectedFsPath = getUri(monaco, props.selectedPath).fsPath;
  const previousSelectedModel = store.editor!.getModel();
  if (!props.readOnly && previousSelectedModel) {
    const viewState = store.editor!.saveViewState();
    if (viewState) {
      store.viewStates[previousSelectedModel.uri.fsPath] = noSerialize(viewState);
    }
  }

  if (!previousSelectedModel || previousSelectedModel.uri.fsPath !== selectedFsPath) {
    const selectedModel = monaco.editor.getModels().find((m) => m.uri.fsPath === selectedFsPath);
    if (selectedModel) {
      store.editor!.setModel(selectedModel);

      if (!props.readOnly) {
        const viewState = store.viewStates[selectedModel.uri.fsPath];
        if (viewState) {
          store.editor!.restoreViewState(viewState);
        }
        store.editor!.focus();
      }
    }
  }
};

const getMonaco = async (): Promise<Monaco> => {
  if (!monacoCtx.loader) {
    // lazy-load the monaco AMD script ol' school
    monacoCtx.loader = new Promise<Monaco>((resolve, reject) => {
      const script = document.createElement('script');
      script.addEventListener('error', reject);
      script.addEventListener('load', () => {
        require.config({ paths: { vs: MONACO_VS_URL } });
        require(['vs/editor/editor.main'], () => {
          resolve((globalThis as any).monaco);
        });
      });
      script.async = true;
      script.src = MONACO_LOADER_URL;
      document.head.appendChild(script);
    });
  }
  return monacoCtx.loader;
};

const loadDeps = async (qwikVersion: string) => {
  const deps: NodeModuleDep[] = [
    {
      pkgName: '@builder.io/qwik',
      pkgVersion: qwikVersion,
      pkgPath: '/core.d.ts',
      fsPath: '/node_modules/@types/builder.io__qwik/index.d.ts',
    },
    {
      pkgName: '@builder.io/qwik',
      pkgVersion: qwikVersion,
      pkgPath: '/jsx-runtime.d.ts',
      fsPath: '/node_modules/@types/builder.io__qwik/jsx-runtime.d.ts',
    },
    {
      pkgName: '@builder.io/qwik',
      pkgVersion: qwikVersion,
      pkgPath: '/server.d.ts',
      fsPath: '/node_modules/@types/builder.io__qwik/server.d.ts',
    },
  ];

  await Promise.all(
    deps.map(async (dep) => {
      let storedDep = monacoCtx.deps.find(
        (d) =>
          d.pkgName === dep.pkgName && d.pkgPath === dep.pkgPath && d.pkgVersion === dep.pkgVersion
      );
      if (!storedDep) {
        storedDep = {
          pkgName: dep.pkgName,
          pkgVersion: dep.pkgVersion,
          pkgPath: dep.pkgPath,
          fsPath: dep.fsPath,
        };
        monacoCtx.deps.push(storedDep);

        storedDep.promise = new Promise<void>((resolve, reject) => {
          const url = getCdnUrl(dep.pkgName, dep.pkgVersion, dep.pkgPath);
          fetch(url).then((rsp) => {
            rsp.text().then((code) => {
              storedDep!.code = code;
              resolve();
            }, reject);
          }, reject);
        });
      }
      await storedDep.promise;
    })
  );

  return monacoCtx.deps;
};

const getUri = (monaco: Monaco, filePath: string) => {
  return new monaco.Uri().with({ path: filePath });
};

const defaultEditorOpts: IStandaloneEditorConstructionOptions = {
  automaticLayout: true,
  fixedOverflowWidgets: true,
  lineDecorationsWidth: 5,
  lineNumbersMinChars: 3,
  minimap: { enabled: false },
  roundedSelection: false,
  scrollBeyondLastLine: false,
  tabSize: 2,
};

const monacoCtx: MonacoContext = {
  deps: [],
  loader: null,
};

const getCdnUrl = (pkgName: string, pkgVersion: string, pkgPath: string) => {
  return `https://cdn.jsdelivr.net/npm/${pkgName}@${pkgVersion}${pkgPath}`;
};

const MONACO_VERSION = '0.33.0';
const MONACO_VS_URL = getCdnUrl('monaco-editor', MONACO_VERSION, '/min/vs');
const MONACO_LOADER_URL = `${MONACO_VS_URL}/loader.js`;

export type Monaco = typeof MonacoTypes;
export type IStandaloneCodeEditor = MonacoTypes.editor.IStandaloneCodeEditor;
export type ICodeEditorViewState = MonacoTypes.editor.ICodeEditorViewState;
export type IStandaloneEditorConstructionOptions =
  MonacoTypes.editor.IStandaloneEditorConstructionOptions;
export type IModelContentChangedEvent = MonacoTypes.editor.IModelContentChangedEvent;

interface MonacoContext {
  deps: NodeModuleDep[];
  loader: Promise<Monaco> | null;
}

interface NodeModuleDep {
  pkgName: string;
  pkgPath: string;
  pkgVersion: string;
  fsPath: string;
  code?: string;
  promise?: Promise<void>;
}

declare const require: any;

// don't let these globals accidentally get used
// they need to use the lazy loaded versions
declare const editor: never;
declare const monaco: never;

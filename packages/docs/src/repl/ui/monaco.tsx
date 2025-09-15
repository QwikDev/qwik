import { noSerialize } from '@qwik.dev/core';
import type { Diagnostic } from '@qwik.dev/core/optimizer';
import type MonacoTypes from 'monaco-editor';
import type { EditorProps, EditorStore } from './editor';
import type { ReplStore } from '../types';
import { getTheme } from '../../components/theme-toggle/theme-toggle';
import { bundled, getDeps, getNpmCdnUrl } from '../bundler/bundled';
import { isServer } from '@qwik.dev/core';
import { QWIK_PKG_NAME_V1, QWIK_PKG_NAME_V2 } from '../repl-constants';

export const initMonacoEditor = async (
  containerElm: any,
  props: EditorProps,
  editorStore: EditorStore,
  replStore: ReplStore
) => {
  const monaco = await getMonaco();
  const ts = monaco.languages.typescript;

  ts.typescriptDefaults.setCompilerOptions({
    ...ts.typescriptDefaults.getCompilerOptions(),
    allowJs: true,
    allowNonTsExtensions: true,
    esModuleInterop: true,
    isolatedModules: true,
    jsx: ts.JsxEmit.ReactJSX,
    jsxImportSource: '@qwik.dev/core',
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.Latest,
  });

  ts.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: false,
  });

  ts.javascriptDefaults.setCompilerOptions({
    target: ts.ScriptTarget.ESNext,
    allowNonTsExtensions: true,
  });

  ts.javascriptDefaults.workerOptions;

  const editor = monaco.editor.create(containerElm, {
    ...defaultEditorOpts,
    ariaLabel: props.ariaLabel,
    lineNumbers: props.lineNumbers,
    wordWrap: props.wordWrap,
    model: null,
    theme: getEditorTheme(getTheme() === 'dark'),
  });

  ts.typescriptDefaults.setEagerModelSync(true);

  if (props.onChange$) {
    let debounceTmrId: any = null;
    let diagnosticsTmrId: any = null;

    editorStore.onChangeSubscription = noSerialize(
      editor.onDidChangeModelContent(async () => {
        clearTimeout(debounceTmrId);
        debounceTmrId = setTimeout(() => {
          props.onChange$(props.store.selectedInputPath, editor.getValue());
        }, 200);

        clearTimeout(diagnosticsTmrId);
        diagnosticsTmrId = setTimeout(() => {
          checkDiagnostics(monaco, editor, replStore);
        }, 50);
      })
    );
  }

  editorStore.editor = noSerialize(editor);
};

export const updateMonacoEditor = async (props: EditorProps, editorStore: EditorStore) => {
  const monaco = await getMonaco();

  const selectedPath = props.store.selectedInputPath;
  const inputs = props.input.files;
  const existingModels = monaco.editor.getModels();

  for (const existingModel of existingModels) {
    try {
      const input = inputs.find((i) => getUri(monaco, i.path).fsPath === existingModel.uri.fsPath);
      if (input) {
        if (input.code !== existingModel.getValue()) {
          existingModel.setValue(input.code);
        }
      } else {
        existingModel.dispose();
      }
    } catch (e) {
      console.error(existingModel.uri.fsPath, e);
    }
  }

  for (const input of inputs) {
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

  if (editorStore.editor) {
    const selectedFsPath = getUri(monaco, selectedPath).fsPath;
    const previousSelectedModel = editorStore.editor.getModel();
    if (previousSelectedModel) {
      const viewState = editorStore.editor.saveViewState();
      if (viewState) {
        editorStore.viewStates[previousSelectedModel.uri.fsPath] = noSerialize(viewState);
      }
    }

    if (!previousSelectedModel || previousSelectedModel.uri.fsPath !== selectedFsPath) {
      const selectedModel = monaco.editor.getModels().find((m) => m.uri.fsPath === selectedFsPath);
      if (selectedModel) {
        editorStore.editor.setModel(selectedModel);

        const viewState = editorStore.viewStates[selectedModel.uri.fsPath];
        if (viewState) {
          editorStore.editor.restoreViewState(viewState);
        }
        editorStore.editor.focus();
      }
    }
  }
};

export const getEditorTheme = (isDark: boolean) => {
  return isDark ? 'vs-dark' : 'vs';
};

const checkDiagnostics = async (
  monaco: Monaco,
  editor: IStandaloneCodeEditor,
  replStore: ReplStore
) => {
  if (!monacoCtx.tsWorker) {
    const getTsWorker = await monaco.languages.typescript.getTypeScriptWorker();
    monacoCtx.tsWorker = await getTsWorker(editor.getModel()!.uri);
  }
  const tsWorker = monacoCtx.tsWorker;

  const models = monaco.editor.getModels();
  const tsDiagnostics: TypeScriptDiagnostic[] = [];

  await Promise.all(
    models.map(async (m) => {
      const filePath = `file://${m.uri.fsPath}`;
      const semPromise = tsWorker.getSemanticDiagnostics(filePath);
      const synPromise = tsWorker.getSyntacticDiagnostics(filePath);
      tsDiagnostics.push(...(await semPromise));
      tsDiagnostics.push(...(await synPromise));
    })
  );

  if (tsDiagnostics.length > 0) {
    replStore.monacoDiagnostics = tsDiagnostics.map((tsd) => {
      const d: Diagnostic = {
        message: getTsDiagnosticMessage(tsd.messageText),
        category: 'error',
        highlights: [],
        code: `TSC: ${tsd.code}`,
        file: tsd.file?.fileName || '',
        scope: 'monaco',
        suggestions: null,
      };
      return d;
    });
  } else if (replStore.monacoDiagnostics.length > 0) {
    replStore.monacoDiagnostics = [];

    if (replStore.selectedOutputPanel === 'diagnostics' && replStore.diagnostics.length === 0) {
      replStore.selectedOutputPanel = 'app';
    }
  }
};

const getTsDiagnosticMessage = (m: string | DiagnosticMessageChain) => {
  if (m) {
    if (typeof m === 'string') {
      return m;
    }
    return m.messageText;
  }
  return '';
};

export const addQwikLibs = async (version: string) => {
  const monaco = await getMonaco();
  const typescriptDefaults = monaco.languages.typescript.typescriptDefaults;

  const deps = await loadDeps(version);
  deps.forEach((dep) => {
    if (dep && typeof dep.code === 'string') {
      typescriptDefaults.addExtraLib(
        `declare module '${dep.pkgName}${dep.import}' { ${dep.code}\n }`,
        `/node_modules/${dep.pkgName}${dep.pkgPath}`
      );
    }
  });
  typescriptDefaults.addExtraLib(
    `declare module '@qwik.dev/core/jsx-runtime' { export * from '@qwik.dev/core' }`,
    '/node_modules/@qwik.dev/core/dist/jsx-runtime.d.ts'
  );
  typescriptDefaults.addExtraLib(CLIENT_LIB);
};

const loadDeps = async (pkgVersion: string) => {
  const deps: NodeModuleDep[] = [
    // qwik
    {
      pkgName: QWIK_PKG_NAME_V1,
      pkgVersion,
      pkgPath: `/dist/core.d.ts`,
      import: '',
    },
    // server API
    {
      pkgName: QWIK_PKG_NAME_V1,
      pkgVersion,
      pkgPath: `/dist/server.d.ts`,
      import: '/server',
    },
    // build constants
    {
      pkgName: QWIK_PKG_NAME_V1,
      pkgVersion,
      pkgPath: `/dist/build/index.d.ts`,
      import: '/build',
    },
    // qwik
    {
      pkgName: QWIK_PKG_NAME_V2,
      pkgVersion,
      pkgPath: `/dist/core.d.ts`,
      import: '',
    },
    // server API
    {
      pkgName: QWIK_PKG_NAME_V2,
      pkgVersion,
      pkgPath: `/dist/server.d.ts`,
      import: '/server',
    },
    // build constants
    {
      pkgName: QWIK_PKG_NAME_V2,
      pkgVersion,
      pkgPath: `/dist/build/index.d.ts`,
      import: '/build',
    },
  ];

  const depUrls = getDeps(pkgVersion);
  const toFetch: Record<string, Promise<string>> = {};
  for (const dep of deps) {
    let storedDep = monacoCtx.deps.find(
      (d) =>
        d.pkgName === dep.pkgName && d.pkgPath === dep.pkgPath && d.pkgVersion === dep.pkgVersion
    );
    if (!storedDep) {
      storedDep = {
        pkgName: dep.pkgName,
        pkgVersion: dep.pkgVersion,
        pkgPath: dep.pkgPath,
        import: dep.import,
      };
      monacoCtx.deps.push(storedDep);

      const url = depUrls[dep.pkgName][dep.pkgPath];
      if (!url) {
        console.error(`Missing URL for ${dep.pkgName}${dep.pkgPath} (${dep.pkgVersion})`);
        break;
      }
      toFetch[url] ||= fetch(url).then((r) => r.text());
      toFetch[url].then(
        (code) => {
          storedDep!.code = code;
        },
        (error) => {
          console.error(error);
        }
      );
    }
  }
  await Promise.all(Object.values(toFetch));

  return monacoCtx.deps;
};

const getMonaco = async (): Promise<Monaco> => {
  if (isServer) {
    throw new Error('Monaco cannot be used on the server');
  }
  if (!monacoCtx.loader) {
    // lazy-load the monaco AMD script ol' school
    monacoCtx.loader = new Promise<Monaco>((resolve, reject) => {
      const script = document.createElement('script');
      script.addEventListener('error', reject);
      script.addEventListener('load', () => {
        require.config({ paths: { vs: MONACO_VS_URL } });

        // https://cdn.jsdelivr.net/npm/monaco-editor@0.33.0/min/vs/editor/editor.main.js
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

const getUri = (monaco: Monaco, filePath: string) => {
  return new monaco.Uri().with({ path: filePath });
};

const defaultEditorOpts: IStandaloneEditorConstructionOptions = {
  automaticLayout: true,
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
  tsWorker: null,
};

const MONACO_VERSION = '0.45.0';
const MONACO_VS_URL = getNpmCdnUrl(bundled, 'monaco-editor', MONACO_VERSION, '/min/vs');
const MONACO_LOADER_URL = `${MONACO_VS_URL}/loader.js`;

const CLIENT_LIB = `
declare module '*.css' {}
declare module '*.css?inline' {
  const css: string
  export default css
}
`;

export type Monaco = typeof MonacoTypes;
export type IStandaloneCodeEditor = MonacoTypes.editor.IStandaloneCodeEditor;
export type ICodeEditorViewState = MonacoTypes.editor.ICodeEditorViewState;
export type IStandaloneEditorConstructionOptions =
  MonacoTypes.editor.IStandaloneEditorConstructionOptions;
export type IModelContentChangedEvent = MonacoTypes.editor.IModelContentChangedEvent;
export type TypeScriptWorker = MonacoTypes.languages.typescript.TypeScriptWorker;
export type TypeScriptDiagnostic = MonacoTypes.languages.typescript.Diagnostic;
export type DiagnosticMessageChain = MonacoTypes.languages.typescript.DiagnosticMessageChain;

interface MonacoContext {
  deps: NodeModuleDep[];
  loader: Promise<Monaco> | null;
  tsWorker: null | TypeScriptWorker;
}

interface NodeModuleDep {
  pkgName: string;
  pkgPath: string;
  import: string;
  pkgVersion: string;
  code?: string;
}

declare const require: any;

// don't let these globals accidentally get used
// they need to use the lazy loaded versions
declare const editor: never;
declare const monaco: never;

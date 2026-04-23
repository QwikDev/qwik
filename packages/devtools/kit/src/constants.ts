export const DEVTOOLS_VITE_MESSAGING_EVENT = 'qwik_tools:vite_messaging_event';

const HOOK_GROUPS = {
  variableDeclaration: [
    'useStore',
    'useSignal',
    'useComputed',
    'useAsyncComputed',
    'useContext',
    'useId',
    'useStyles',
    'useStylesScoped',
    'useConstant',
    'useErrorBoundary',
    'useSerializer',
    'useServerData',
    'useLocation',
    'useNavigate',
    'useContent',
    'useDocumentHead',
  ] as const,
  expressionStatement: [
    'useVisibleTask',
    'useTask',
    'useResource',
    'useContextProvider',
    'usePreventNavigate',
  ] as const,
  listener: ['useOn', 'useOnDocument', 'useOnWindow'] as const,
  noReturn: ['useVisibleTask', 'useTask'] as const,
} as const;

export const VARIABLE_DECLARATION_LIST = HOOK_GROUPS.variableDeclaration;
export const EXPRESSION_STATEMENT_LIST = HOOK_GROUPS.expressionStatement;
export const USE_HOOK_LIST = [
  ...VARIABLE_DECLARATION_LIST,
  ...HOOK_GROUPS.listener,
  ...EXPRESSION_STATEMENT_LIST,
] as const;

export const QSEQ = 'q:seq';
export const QPROPS = 'q:props';
export const QRENDERFN = 'q:renderFn';
export const QTYPE = 'q:type';

export const VIRTUAL_QWIK_DEVTOOLS_KEY = 'virtual-qwik-devtools.ts';

export const INNER_USE_HOOK = 'useCollectHooks';

export const QWIK_DEVTOOLS_GLOBAL_STATE = 'QWIK_DEVTOOLS_GLOBAL_STATE';
export const QWIK_PRELOADS_UPDATE_EVENT = 'qwik:preloads-update';

export const QRL_KEY = '$qrl$';
export const COMPUTED_QRL_KEY = '$computeQrl$';
export const CHUNK_KEY = '$chunk$';
export const CAPTURE_REF_KEY = '$captureRef$';

export const NORETURN_HOOK = HOOK_GROUPS.noReturn;

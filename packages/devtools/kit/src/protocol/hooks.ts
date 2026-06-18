export const HOOK_GROUPS = {
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
export const NORETURN_HOOK = HOOK_GROUPS.noReturn;

export const SIGNAL_HOOK_TYPES = [
  'useSignal',
  'useStore',
  'useComputed',
  'useAsyncComputed',
  'useContext',
] as const;

export const INNER_USE_HOOK = 'useCollectHooks';
export const VIRTUAL_QWIK_DEVTOOLS_KEY = 'virtual-qwik-devtools.ts';
export const QWIK_DEVTOOLS_HOOK_VERSION = 1;

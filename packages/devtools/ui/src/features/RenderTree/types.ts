import type { TreeNode } from '../../components/Tree/type';
import type { ParsedStructure } from '@qwik.dev/devtools/kit';
import type { QRL } from '@qwik.dev/core';
// ============================================================================
// Hook Type Definitions
// ============================================================================

export const HOOK_CATEGORIES = {
  VARIABLE_DECLARATION: 'variableDeclaration',
  EXPRESSION_STATEMENT: 'expressionStatement',
  SPECIAL: 'special',
} as const;

export type HookCategory = (typeof HOOK_CATEGORIES)[keyof typeof HOOK_CATEGORIES];

/** All supported hook types in the devtools */
export const HOOK_TYPES = [
  // Variable declaration hooks
  'useStore',
  'useSignal',
  'useContext',
  'useId',
  'useStyles',
  'useStylesScoped',
  'useConstant',
  'useComputed',
  'useAsyncComputed',
  'useErrorBoundary',
  'useServerData',
  'useSerializer',
  'useLocation',
  'useNavigate',
  'useContent',
  'useDocumentHead',
  // Expression statement hooks
  'useTask',
  'useVisibleTask',
  'useResource',
  'useContextProvider',
  'usePreventNavigate',
  // Special types
  'props',
  'listens',
  'render',
  'customhook',
] as const;

export type HookType = (typeof HOOK_TYPES)[number];

/** Hooks that should be hidden from the filter list by default */
export const HIDDEN_HOOKS: readonly HookType[] = [
  'useResource',
  'usePreventNavigate',
  'render',
] as const;

/** Hooks that contain QRL references (used for code lookup) */
export const QRL_HOOKS: readonly HookType[] = [
  'useTask',
  'useVisibleTask',
  'useComputed',
  'useAsyncComputed',
  'useServerData',
  'useSerializer',
  'render',
  'listens',
] as const;

// ============================================================================
// QRL Internal Types
// ============================================================================

/**
 * QRLDev contains development metadata. Exists in @qwik.dev/core but not exported as a type.
 *
 * @internal Runtime type from Qwik
 */
export interface QRLDev {
  file: string;
  lo: number;
  hi: number;
}

/**
 * Internal QRL properties that exist at runtime. These are part of `QRLInternalMethods` in
 * @qwik.dev/core but NOT exported.
 *
 * @internal Runtime type from Qwik
 * @see QRLInternalMethods in @qwik.dev/core/dist/core-internal.d.ts (line 2240)
 */
export interface QRLInternalMethods {
  readonly $chunk$: string | null;
  readonly $symbol$: string;
  readonly $hash$: string;
  $captures$: Readonly<unknown[]> | string | null;
  dev?: QRLDev | null;
  getSymbol(): string;
  getHash(): string;
  getCaptured(): unknown[] | null;
}

/**
 * QRL with internal properties accessible. Combines public QRL type with internal runtime
 * properties.
 *
 * Note: `QRLInternal<T>` exists in Qwik but is NOT exported. We define our own to access `$chunk$`
 * and `$captureRef$`.
 */
export type QRLInternal<T = unknown> = QRL<T> & QRLInternalMethods;

// ============================================================================
// Data Structure Types
// ============================================================================

/** Configuration for a hook type in the store */
export interface HookConfig {
  /** Whether this hook type is visible in the UI filter */
  visible: boolean;
  /** Category of the hook for special handling */
  category: HookCategory;
}

/** Entry stored in the hook data store */
export interface HookEntry<T = unknown> {
  type: HookType;
  data: T;
  variableName?: string;
  category?: string;
}

/** Props/Listens/Render entry (simple key-value) */
export interface SimpleHookEntry {
  data: Record<string, unknown>;
}

/** Parsed hook entry with full metadata */
export interface ParsedHookEntry extends ParsedStructure {
  data: unknown;
}

export type HookDataEntry = SimpleHookEntry | ParsedHookEntry;

export interface CodeModule {
  pathId: string;
  modules: { code: string } | null;
  error?: string;
}

// ============================================================================
// Tree Building Types
// ============================================================================

/** Options for tree node generation */
export interface TreeNodeOptions {
  resetIdCounter?: boolean;
}

/** Result of building hook tree data */
export interface HookTreeResult {
  nodes: TreeNode[];
  filters: HookFilterItem[];
}

/** Filter item for the UI */
export interface HookFilterItem {
  key: HookType;
  display: boolean;
}

// ============================================================================
// Utility Types & Type Guards
// ============================================================================

export function isSimpleHookEntry(entry: unknown): entry is SimpleHookEntry {
  return (
    typeof entry === 'object' &&
    entry !== null &&
    'data' in entry &&
    typeof (entry as SimpleHookEntry).data === 'object'
  );
}

export function isParsedHookEntry(entry: unknown): entry is ParsedHookEntry {
  return (
    typeof entry === 'object' && entry !== null && 'hookType' in entry && 'variableName' in entry
  );
}

/** Type guard to check if a QRL has internal properties accessible */
export function isQRLInternal(qrl: unknown): qrl is QRLInternal {
  if (typeof qrl !== 'object' || qrl === null) {
    return false;
  }
  return '$chunk$' in qrl || '$symbol$' in qrl;
}

/**
 * Safely cast QRL to QRLInternal for accessing internal properties. Use this instead of `as unknown
 * as Record<string, unknown>`.
 */
export function asQRLInternal<T>(qrl: QRL<T>): QRLInternal<T> {
  return qrl as QRLInternal<T>;
}

/**
 * Runtime devtools hook exposed on `window.__QWIK_DEVTOOLS_HOOK__` by the `@devtools/plugin` in dev
 * mode.
 *
 * Provides structured access to component state, signals, and render events for both the in-app
 * overlay and the browser extension.
 */
export interface QwikDevtoolsHook {
  /** Hook API version. Consumers must check this before using the API. */
  version: 1;

  // -- Signal inspection ------------------------------------------------

  /**
   * Read the current value of a signal reference. Only works in-page (not serializable for
   * extension eval).
   */
  getSignalValue(signal: unknown): unknown;

  /** Return a serializable snapshot of all tracked signals grouped by component source path. */
  getSignalsSnapshot(): QwikDevtoolsSignalsSnapshot;

  // -- Component inspection ---------------------------------------------

  /**
   * Return a serializable snapshot of all tracked components with their hooks and current signal
   * values.
   */
  getComponentTreeSnapshot(): QwikDevtoolsComponentSnapshot[];

  // -- Event subscriptions ----------------------------------------------

  /** Subscribe to CSR render events. Returns an unsubscribe function. */
  onRender(callback: (info: QwikDevtoolsRenderEvent) => void): () => void;

  /**
   * Subscribe to signal value changes. Returns an unsubscribe function.
   *
   * Note: v1 does not implement real-time signal tracking. Consumers should poll
   * {@link getSignalsSnapshot} and diff.
   */
  onSignalUpdate(callback: (info: QwikDevtoolsSignalEvent) => void): () => void;
}

/** Serializable signal snapshot grouped by component path. */
export type QwikDevtoolsSignalsSnapshot = Record<string, QwikDevtoolsSignalEntry[]>;

/** A single tracked signal entry. */
export interface QwikDevtoolsSignalEntry {
  name: string;
  hookType: string;
  value: unknown;
}

/** Serializable component snapshot. */
export interface QwikDevtoolsComponentSnapshot {
  /** Source path (e.g. `src/routes/index.tsx_Counter`) */
  path: string;
  /** Short display name */
  name: string;
  /** Tracked signals with current values */
  signals: QwikDevtoolsSignalEntry[];
  /** All hook metadata */
  hooks: Array<{
    variableName: string;
    hookType: string;
    category: string;
  }>;
}

/** Emitted when a component renders (CSR only). */
export interface QwikDevtoolsRenderEvent {
  component: string;
  phase: 'ssr' | 'csr';
  duration: number;
  timestamp: number;
}

/** Emitted when a signal value changes. */
export interface QwikDevtoolsSignalEvent {
  componentPath: string;
  signalName: string;
  oldValue: unknown;
  newValue: unknown;
  timestamp: number;
}

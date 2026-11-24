import type { ReplAppInput } from '../types';

export const BUILD_MODE_OPTIONS: ReplAppInput['buildMode'][] = ['development', 'production'];

export const isBuildMode = (value: string | null): value is ReplAppInput['buildMode'] =>
  BUILD_MODE_OPTIONS.some((buildMode) => buildMode === value);

// We don't support `inline` and `hoist` for client bundles
export const ENTRY_STRATEGY_OPTIONS = ['segment', 'single', 'smart'];

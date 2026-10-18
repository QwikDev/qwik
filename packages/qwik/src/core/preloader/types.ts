export const BundleImportState_None = 0;
export const BundleImportState_Queued = 1;
export const BundleImportState_Preload = 2;
export const BundleImportState_Alias = 3;
export const BundleImportState_Loaded = 4;

export type BundleInfo = {
  $inverseProbability$: number;
  // TODO check if for performance we should use refs instead of ids
  $deps$?: ImportProbability[];
};

export type BundleImport = BundleInfo & {
  $name$: string;
  /** Priority of the most recent needed ancestor. */
  $priority$: number;
  /** Priority of the active render that needs this dependency. */
  $renderPriority$: number;
  $state$: number;
  $createdTs$: number;
  $waitedMs$: number;
  $loadedMs$: number;
};

export type BundleImports = Map<string, BundleImport>;

export type ImportProbability = {
  /** Bundle name */
  $name$: string;
  /** Probability */
  $importProbability$: number;
  /** Render dependency, rather than a prediction of a future interaction. */
  $isRender$?: boolean;
  /** Probability adjust factor */
  $factor$: number;
};

export type BundleGraph = Map<string, ImportProbability[]>;

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
  /** Probability adjust factor */
  $factor$: number;
};

export type BundleGraph = Map<string, ImportProbability[]>;

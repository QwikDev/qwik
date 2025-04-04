export const enum BundleImportState {
  None,
  Queued,
  Preload,
  Alias,
  Loaded,
}

export type BundleInfo = {
  $inverseProbability$: number;
  // TODO check if for performance we should use refs instead of ids
  $deps$?: ImportProbability[];
};

export type BundleImport = BundleInfo & {
  $name$: string;
  $url$: string | null;
  $state$: BundleImportState;
  $createdTs$: number;
  $waitedMs$: number;
  $loadedMs$: number;
};

export type BundleImports = Map<string, BundleImport>;

export type ImportProbability = {
  /** Bundle name */
  $name$: string;
  /** Probability */
  $probability$: number;
  /** Probability adjust factor */
  $factor$: number;
};

export type BundleGraph = Map<string, ImportProbability[]>;

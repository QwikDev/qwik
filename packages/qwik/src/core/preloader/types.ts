export const BundleImportState_None = 0;
export const BundleImportState_Queued = 1;
export const BundleImportState_Preload = 2;
export const BundleImportState_Alias = 3;
export const BundleImportState_Loaded = 4;

export type BundleInfo = {
  $inverseProbability$: number;
  // TODO check if for performance we should use refs instead of ids
  $deps$?: BundleDep[];
};

export type BundleImport = BundleInfo & {
  $name$: string;
  $state$: number;
  /** 0 none, 1 handler, 2 other QRL, 3 component */
  $kind$: number;
  $rank$: number;
  $hintOrder$: number;
  $rendersPage$?: boolean;
  $failures$?: number;
};

export type BundleImports = Map<string, BundleImport>;

export type BundleDep = {
  /** Bundle name */
  $name$: string;
  $isStatic$: boolean;
};

export type BundleGraph = Map<string, { $deps$: BundleDep[]; $kind$: number }>;

declare module 'which-pm-runs' {
  export function whichPMRuns(): { name: string; version: string } | undefined;
}

import type { Diagnostic, OutputFile } from '../types';

export interface EsbuildResult {
  outputFiles: OutputFile[];
  diagnostics: Diagnostic[];
  diagnosticsSummary?: string;
  timers: {
    clientBuild: number;
    serverBuild: number;
    totalBuild: number;
  };
}

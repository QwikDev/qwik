import { BuildConfig, panic } from './util';
import ts from 'typescript';

export function tsc(config: BuildConfig) {
  const tsconfigFile = ts.findConfigFile(config.rootDir, ts.sys.fileExists);
  const tsconfig = ts.getParsedCommandLineOfConfigFile(tsconfigFile!, undefined, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (d) => {
      throw new Error(String(d));
    },
  });
  if (tsconfig && Array.isArray(tsconfig.fileNames)) {
    const rootNames = tsconfig.fileNames;
    const program = ts.createProgram({
      rootNames,
      options: { ...tsconfig.options, outDir: config.tscDir },
    });
    const diagnostics = [
      ...program.getDeclarationDiagnostics(),
      ...program.getGlobalDiagnostics(),
      ...program.getOptionsDiagnostics(),
      ...program.getSemanticDiagnostics(),
      ...program.getSyntacticDiagnostics(),
    ];
    if (diagnostics.length > 0) {
      const err = ts.formatDiagnostics(diagnostics, {
        ...ts.sys,
        getCanonicalFileName: (f) => f,
        getNewLine: () => '\n',
      });
      panic(err);
    }
    program.emit();
    console.log('🐶 tsc');
  } else {
    throw new Error(`invalid tsconfig`);
  }
}

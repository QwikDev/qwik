import { log } from '@clack/prompts';
import {
  IndentationText,
  Project,
  QuoteKind,
  type ProjectOptions,
  type SourceFile,
} from 'ts-morph';
import { visitNotIgnoredFiles } from '../tools/visit-not-ignored-files';

/** Transforms a file in place, returns whether it changed. */
export type Codemod = (file: SourceFile) => boolean;

/** A ts-morph project that inserts code in the Qwik starters style. */
export const createProject = (options: ProjectOptions = {}) =>
  new Project({
    ...options,
    manipulationSettings: {
      indentationText: IndentationText.TwoSpaces,
      quoteKind: QuoteKind.Single,
    },
  });

const SOURCE_FILE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

/** Transforms the whole project, e.g. moves files. */
export type ProjectCodemod = (project: Project) => void;

export function runCodemods(codemods: Codemod[], projectCodemods: ProjectCodemod[] = []) {
  const project = createProject();
  visitNotIgnoredFiles('.', (path) => {
    if (SOURCE_FILE.test(path) && !path.endsWith('.d.ts')) {
      project.addSourceFileAtPath(path);
    }
  });
  for (const codemod of projectCodemods) {
    codemod(project);
  }
  for (const file of project.getSourceFiles()) {
    let changed = false;
    for (const codemod of codemods) {
      changed = codemod(file) || changed;
    }
    if (changed) {
      log.info(`Updated ${file.getFilePath()}`);
    }
  }
  project.saveSync();
}

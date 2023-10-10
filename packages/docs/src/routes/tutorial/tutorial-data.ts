import type { ReplModuleInput } from '../../repl/types';

export interface TutorialSection {
  id: string;
  title: string;
  apps: TutorialApp[];
}

export interface TutorialApp {
  id: string;
  title: string;
  problemInputs: ReplModuleInput[];
  solutionInputs: ReplModuleInput[];
  enableHtmlOutput?: boolean;
  enableClientOutput?: boolean;
  enableSsrOutput?: boolean;
}

/** Generated at build-time. See /packages/docs/src/routes/tutorial/tutorial-menu.json */
const tutorialSections: TutorialSection[] = [];
export default tutorialSections;

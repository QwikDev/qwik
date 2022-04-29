import type { ReplModuleInput } from '../../components/repl/types';

export interface TutorialSection {
  id: string;
  title: string;
  tutorials: TutorialApp[];
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

// generated at build-time
// see /docs/pages/tutorial/tutorial-menu.json
const tutorials: TutorialSection[] = [];
export default tutorials;

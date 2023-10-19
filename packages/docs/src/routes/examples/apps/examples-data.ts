import type { ReplModuleInput } from '../../../repl/types';

export interface ExampleSection {
  id: string;
  title: string;
  apps: ExampleApp[];
}

export interface ExampleApp {
  id: string;
  title: string;
  description: string;
  icon: string;
  inputs: ReplModuleInput[];
}

/**
 * Generated at build-time.
 *
 * See packages/docs/src/routes/examples/apps/examples-menu.json
 */
const exampleSections: ExampleSection[] = [];
export default exampleSections;

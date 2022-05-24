import type { ReplModuleInput } from '../../components/repl/types';

export interface ExampleSection {
  id: string;
  title: string;
  apps: ExampleApp[];
}

export interface ExampleApp {
  id: string;
  title: string;
  description: string;
  inputs: ReplModuleInput[];
}

// generated at build-time
// see /docs/pages/examples/examples-menu.json
const exampleSections: ExampleSection[] = [];
export default exampleSections;

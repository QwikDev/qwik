import type { ReplModuleInput } from '../../components/repl/types';

export interface ExampleApp {
  title: string;
  id: string;
  description: string;
  inputs: ReplModuleInput[];
}

// generated at build-time
const apps: ExampleApp[] = [];
export default apps;

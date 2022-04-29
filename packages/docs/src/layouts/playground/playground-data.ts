import type { ReplModuleInput } from '../../components/repl/types';

export interface PlaygroundApp {
  title: string;
  id: string;
  inputs: ReplModuleInput[];
}

// generated at build-time
const apps: PlaygroundApp[] = [];
export default apps;

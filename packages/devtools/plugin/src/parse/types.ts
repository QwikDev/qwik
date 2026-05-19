/** Shared types for the parse module */

export interface InjectOptions {
  path?: string;
}

export type InsertTask = { kind: 'insert'; pos: number; text: string };
export type ReplaceTask = {
  kind: 'replace';
  start: number;
  end: number;
  text: string;
};
export type SourceEdit = InsertTask | ReplaceTask;
export type InjectionTask = SourceEdit;

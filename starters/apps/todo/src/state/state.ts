////////////////////////////////////////////////////////////////////////
// Todo Application State Interfaces
////////////////////////////////////////////////////////////////////////

import { createContext } from '@builder.io/qwik';

export const TODOS = createContext<Todos>('TodoApp');

export interface TodoItem {
  id: string;
  completed: boolean;
  title: string;
}

export interface Todos {
  filter: FilterStates;
  items: TodoItem[];
  nextItemId: number;
}

export type FilterStates = 'all' | 'active' | 'completed';

export const FilterStates: FilterStates[] = ['all', 'active', 'completed'];

export const FILTERS = {
  all: () => true,
  active: (i: TodoItem) => i.completed == false,
  completed: (i: TodoItem) => i.completed == true,
};

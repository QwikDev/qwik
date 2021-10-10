import { qObject } from '@builder.io/qwik';

////////////////////////////////////////////////////////////////////////
// Todo Application State Interfaces
////////////////////////////////////////////////////////////////////////

export interface TodoItem {
  completed: boolean;
  title: string;
}

export interface Todos {
  filter: FilterStates;
  items: TodoItem[];
}

////////////////////////////////////////////////////////////////////////
// Todo Application State Mutation Functions
////////////////////////////////////////////////////////////////////////

export function addItem(todos: Todos, text: string) {
  todos.items.push(qObject({ completed: false, title: text }));
  updateFilter(todos);
}

export function removeItem(todos: Todos, TodoItem: TodoItem) {
  todos.items = todos.items.filter((i) => i != TodoItem);
  updateFilter(todos);
}
export function toggleItem(todos: Todos, TodoItem: TodoItem) {
  TodoItem.completed = !TodoItem.completed;
  updateFilter(todos);
}

export function clearCompleted(todos: Todos) {
  todos.items = todos.items.filter(FILTERS.active);
  updateFilter(todos);
}

////////////////////////////////////////////////////////////////////////
// Todo Application State Filter Functions
////////////////////////////////////////////////////////////////////////

export type FilterStates = 'all' | 'active' | 'completed';
export const FilterStates: FilterStates[] = ['all', 'active', 'completed'];
export const FILTERS = {
  all: () => true,
  active: (i: TodoItem) => i.completed == false,
  completed: (i: TodoItem) => i.completed == true,
};

export function updateFilter(todos: Todos, filter?: FilterStates) {
  if (filter) {
    todos.filter = filter.toLowerCase() as any;
  }
}

export function getFilteredItems(todos: Todos): TodoItem[] {
  return todos.items.filter(FILTERS[todos.filter]);
}

export function getFilteredCount(todos: Todos) {
  return getFilteredItems(todos).filter(FILTERS.active).length;
}

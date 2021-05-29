/**
 * @license
 * Copyright BuilderIO All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { Todo, TodoEntity } from '../data/Todo.js';
import {
  QRL,
  injectFunction,
  jsxFactory,
  provideComponentProp,
  provideEntityState,
  Provider,
  EntityKey,
  Host,
} from '../qwik.js';

export const _needed_by_JSX_ = jsxFactory; // eslint-disable-line @typescript-eslint/no-unused-vars
export default injectFunction(
  provideEntityState<TodoEntity>(
    provideComponentProp('$todos') as any as Provider<EntityKey<TodoEntity>>
  ), // TODO(type): fix cast
  function FooterTemplate(todos: Todo) {
    const remaining = todos.items.length - todos.completed;
    function filterClick(mode: 'All' | 'Active' | 'Completed') {
      const lMode = mode.toLowerCase();
      return (
        <li>
          <a
            class={{ selected: todos.filter == lMode }}
            on:click={QRL`base:qwik#emitEvent?$type=selectFilter&filter=${lMode}`}
          >
            {mode}
          </a>
        </li>
      );
    }
    return (
      <Host class="footer" on:selectFilter={QRL`ui:/Footer_selectFilter`}>
        {todos.items.length > 0 ? (
          <>
            <span class="todo-count">
              <strong>{remaining}</strong>
              {remaining == 1 ? ' item' : ' items'} left
            </span>
            <ul class="filters">
              {filterClick('All')}
              {filterClick('Active')}
              {filterClick('Completed')}
            </ul>
            {todos.completed > 0 ? (
              <button class="clear-completed" on:click={QRL`ui:/Footer_archive`}>
                Clear completed
              </button>
            ) : null}
          </>
        ) : null}
      </Host>
    );
  }
);

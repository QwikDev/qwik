/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { Todo, TodoService } from '../../data/Todo/public.js';
import { QRL, injectFunction, jsxFactory, provideComponentProp, provideServiceState, Provider, ServiceKey } from '../../qoot.js';

export const _needed_by_JSX_ = jsxFactory; // eslint-disable-line @typescript-eslint/no-unused-vars
export default injectFunction(
  provideServiceState<TodoService>(provideComponentProp('$todos') as any as Provider<ServiceKey<TodoService>>), // TODO(type): fix cast
  function FooterTemplate(todos: Todo) {
    const remaining = todos.items.length - todos.completed;
    function filterClick(mode: 'All' | 'Active' | 'Completed') {
      const lMode = mode.toLowerCase();
      return (
        <li>
          <a class={{ selected: todos.filter == lMode }}
             on:click={QRL`base:qoot.emitEvent?$type=selectFilter&filter=${lMode}`} >
            {mode}
          </a>
        </li>
      );
    }
    return (
      <>
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
              <button
                class="clear-completed"
                $={{
                  'on:click': QRL`ui:/Footer/archive`,
                }}
              >
                Clear completed
              </button>
            ) : null}
          </>
        ) : null}
      </>
    );
  }
);

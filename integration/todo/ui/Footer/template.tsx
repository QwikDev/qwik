/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { Items, ItemsService } from '../../data/Items/public.js';
import { QRL, injectFunction, jsxFactory, provideComponentProp, provideServiceState } from '../../qoot.js';

export default injectFunction(
  provideServiceState<ItemsService>(provideComponentProp('$items')),
  function FooterTemplate(items: Items) {
    const remaining = items.items.length - items.completed;
    let filter: string = 'all';
    function filterClick(mode: 'All' | 'Active' | 'Completed') {
      const lMode = mode.toLowerCase();
      return (
        <li>
          <a class={{ selected: filter == lMode }}
             on:click={QRL`base:qoot.emitEvent?$type=selectFilter&filter=${lMode}`} >
            {mode}
          </a>
        </li>
      );
    }
    return (
      <>
        {items.items.length > 0 ? (
          <footer class="footer">
            <span class="todo-count">
              <strong>{remaining}</strong>
              {remaining == 1 ? ' item' : ' items'} left
            </span>
            <ul class="filters">
              {filterClick('All')}
              {filterClick('Active')}
              {filterClick('Completed')}
            </ul>
            {items.completed > 0 ? (
              <button
                class="clear-completed"
                $={{
                  'on:click': QRL`ui:/Footer/archive`,
                }}
              >
                Clear completed
              </button>
            ) : null}
          </footer>
        ) : null}
      </>
    );
  }
);

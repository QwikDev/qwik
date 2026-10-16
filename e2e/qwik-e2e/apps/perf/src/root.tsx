import { useSignal } from '@qwik.dev/core';
import { isServer } from '@qwik.dev/core/build';
import { buildData } from './build-data/build-data';

export function Root() {
  const data = useSignal(isServer ? buildData(1_000) : []);
  const selectedItem = useSignal(null);

  return (
    <div class="container">
      <div class="jumbotron">
        <div class="row">
          <div class="col-md-6">
            <h1>Qwik V3 Implementation</h1>
          </div>
          <div class="col-md-6">
            <div class="row">
              <div class="col-sm-6 smallpad">
                <button
                  class="btn btn-primary btn-block"
                  type="button"
                  stoppropagation:click
                  id="run"
                  onClick$={() => (data.value = buildData(1_000))}
                >
                  Create 1,000 rows
                </button>
              </div>
              <div class="col-sm-6 smallpad">
                <button
                  class="btn btn-primary btn-block"
                  type="button"
                  stoppropagation:click
                  id="runlots"
                  onClick$={() => (data.value = buildData(10_000))}
                >
                  Create 10,000 rows
                </button>
              </div>
              <div class="col-sm-6 smallpad">
                <button
                  class="btn btn-primary btn-block"
                  type="button"
                  stoppropagation:click
                  id="add"
                  onClick$={() => (data.value = [...data.value, ...buildData(1_000)])}
                >
                  Append 1,000 rows
                </button>
              </div>
              <div class="col-sm-6 smallpad">
                <button
                  class="btn btn-primary btn-block"
                  type="button"
                  stoppropagation:click
                  id="update"
                  onClick$={() => {
                    const dataValue = data.value;
                    for (let i = 0, d = dataValue, len = d.length; i < len; i += 10) {
                      d[i].label.value += ' !!!';
                    }
                  }}
                >
                  Update every 10th row
                </button>
              </div>
              <div class="col-sm-6 smallpad">
                <button
                  class="btn btn-primary btn-block"
                  type="button"
                  stoppropagation:click
                  id="clear"
                  onClick$={() => (data.value = [])}
                >
                  Clear
                </button>
              </div>
              <div class="col-sm-6 smallpad">
                <button
                  class="btn btn-primary btn-block"
                  type="button"
                  stoppropagation:click
                  id="swaprows"
                  onClick$={() => {
                    const list = data.value;
                    if (list.length > 998) {
                      const next = list.slice();
                      const item = next[1];
                      next[1] = next[998];
                      next[998] = item;
                      data.value = next;
                    }
                  }}
                >
                  Swap Rows
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <table class="table table-hover table-striped test-data">
        <tbody>
          {data.value.map((row) => {
            return (
              <tr key={row.id} class={row.selected.value ? 'danger' : ''}>
                <td class="col-md-1">{row.id}</td>
                <td class="col-md-4">
                  <a
                    onClick$={() => {
                      if (selectedItem.value) {
                        selectedItem.value.selected.value = false;
                      }
                      selectedItem.value = row;
                      row.selected.value = true;
                    }}
                  >
                    {row.label.value}
                  </a>
                </td>
                <td class="col-md-1">
                  <a
                    onClick$={() => {
                      const dataValue = data.value;
                      data.value = dataValue.toSpliced(
                        dataValue.findIndex((d) => d.id === row.id),
                        1
                      );
                    }}
                  >
                    <span class="glyphicon glyphicon-remove" aria-hidden="true"></span>
                  </a>
                </td>
                <td class="col-md-6" />
              </tr>
            );
          })}
        </tbody>
      </table>
      <span class="preloadicon glyphicon glyphicon-remove" aria-hidden="true" />
    </div>
  );
}

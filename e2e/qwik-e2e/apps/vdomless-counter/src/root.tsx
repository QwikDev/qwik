import type { QRL } from '@qwik.dev/core';
import { useSignal, Slot } from '@qwik.dev/core/spark';

const adjectives = ["pretty", "large", "big", "small", "tall", "short", "long", "handsome", "plain", "quaint", "clean", "elegant", "easy", "angry", "crazy", "helpful", "mushy", "odd", "unsightly", "adorable", "important", "inexpensive", "cheap", "expensive", "fancy"]; // prettier-ignore
const colors = ["red", "yellow", "blue", "green", "pink", "brown", "purple", "brown", "white", "black", "orange"]; // prettier-ignore
const nouns = ["table", "chair", "house", "bbq", "desk", "car", "pony", "cookie", "sandwich", "burger", "pizza", "mouse", "keyboard"]; // prettier-ignore

const random = (max: number) => Math.round(Math.random() * 1000) % max;

let nextId = 1;

type Signal<T> = { value: T };

type Row = {
  id: number;
  label: Signal<string>;
  selected: Signal<boolean>;
};

const buildData = (count: number): Row[] => {
  const data = new Array(count);
  for (let i = 0; i < count; i++) {
    const label = useSignal(
      `${adjectives[random(adjectives.length)]} ${colors[random(colors.length)]} ${nouns[random(nouns.length)]}`
    );
    data[i] = {
      id: nextId++,
      label,
      selected: useSignal(false),
    };
  }
  return data;
};

const Button = ({ id, onClick$ }: { id: string; onClick$: QRL<() => any> }) => {
  return (
    <button
      id={id}
      class="btn btn-primary btn-block"
      type="button"
      stoppropagation:click
      onClick$={onClick$}
    >
      <Slot />
    </button>
  );
};

export function Root() {
  const data = useSignal([]);
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
                <Button id="run" onClick$={() => (data.value = buildData(1_000))}>
                  Create 1,000 rows
                </Button>
              </div>
              <div class="col-sm-6 smallpad">
                <Button id="runlots" onClick$={() => (data.value = buildData(10_000))}>
                  Create 10,000 rows
                </Button>
              </div>
              <div class="col-sm-6 smallpad">
                <Button
                  id="add"
                  onClick$={() => (data.value = [...data.value, ...buildData(1_000)])}
                >
                  Append 1,000 rows
                </Button>
              </div>
              <div class="col-sm-6 smallpad">
                <Button
                  id="update"
                  onClick$={() => {
                    const dataValue = data.value;
                    for (let i = 0, d = dataValue, len = d.length; i < len; i += 10) {
                      d[i].label.value += ' !!!';
                    }
                  }}
                >
                  Update every 10th row
                </Button>
              </div>
              <div class="col-sm-6 smallpad">
                <Button id="clear" onClick$={() => (data.value = [])}>
                  Clear
                </Button>
              </div>
              <div class="col-sm-6 smallpad">
                <Button
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
                </Button>
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
                    <span class="glyphicon glyphicon-remove" aria-hidden="true">
                      x
                    </span>
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

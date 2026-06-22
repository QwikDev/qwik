// import { createSignal } from '@qwik.dev/core/spark';

// function Counter({ count }: { count: number }) {
//   return <span>Count from component: {count}</span>;
// }

// function Hello({ name }: { name: string }) {
//   return <span>Hello, {name}!</span>;
// }

// export function Root() {
//   const count = createSignal(0);

//   return (
//     <>
//       <head>
//         <meta charset="utf-8" />
//         <title>Vdomless Counter</title>
//       </head>
//       <body>
//         <main style="font-family: system-ui, sans-serif; max-width: 40rem; margin: 4rem auto; line-height: 1.5;">
//           <h1>Counter</h1>
//           <button
//             id="increment"
//             type="button"
//             style="font: inherit; padding: 0.6rem 0.9rem; border: 1px solid #222; background: white;"
//             onClick$={() => count.value++}
//           >
//             Increment
//           </button>
//           <h2>Update text</h2>
//           <p>{count.value}</p>
//           <h2>Update shared text</h2>
//           <p>Count: {count.value}</p>
//           <h2>Dynamic branches</h2>
//           <p>Count value is {count.value % 2 === 0 ? 'even' : 'odd'}.</p>
//           <h2>Conditional rendering</h2>
//           <p>{count.value > 5 && 'Count is greater than 5'}</p>
//           <p>{count.value > 2 && 'Count is greater than 2 and equal to ' + count.value}</p>
//           <h2>Conditional element rendering</h2>
//           <p>
//             {count.value < 2 ? <span>Count is {count.value}</span> : <b>Count is {count.value}</b>}
//           </p>
//           <h2>Conditional component rendering</h2>
//           <div>{count.value < 2 ? <Hello name="Qwik" /> : <Counter count={count.value} />}</div>
//           <h2>Conditional style render</h2>
//           <p style={{ color: count.value % 2 === 0 ? 'red' : 'blue' }}>
//             This text changes color based on the count value.
//           </p>
//         </main>
//       </body>
//     </>
//   );
// }

import { createSignal } from '@qwik.dev/core/spark';

const adjectives = ["pretty", "large", "big", "small", "tall", "short", "long", "handsome", "plain", "quaint", "clean", "elegant", "easy", "angry", "crazy", "helpful", "mushy", "odd", "unsightly", "adorable", "important", "inexpensive", "cheap", "expensive", "fancy"]; // prettier-ignore
const colors = ["red", "yellow", "blue", "green", "pink", "brown", "purple", "brown", "white", "black", "orange"]; // prettier-ignore
const nouns = ["table", "chair", "house", "bbq", "desk", "car", "pony", "cookie", "sandwich", "burger", "pizza", "mouse", "keyboard"]; // prettier-ignore

const random = (max: number) => Math.round(Math.random() * 1000) % max;

let nextId = 1;

type Row = {
  id: number;
  label: ReturnType<typeof createSignal<string>>;
  selected: ReturnType<typeof createSignal<boolean>>;
};

const buildData = (count: number): Row[] => {
  const data = new Array(count);
  for (let i = 0; i < count; i++) {
    const label = createSignal(
      `${adjectives[random(adjectives.length)]} ${colors[random(colors.length)]} ${nouns[random(nouns.length)]}`
    );
    data[i] = {
      id: nextId++,
      label,
      selected: createSignal(false),
    };
  }
  return data;
};

export function Root() {
  const data = createSignal<Row[]>(buildData(10000));
  const selectedItem = createSignal<Row | null>(null);

  return (
    <div class="container">
      <div class="jumbotron">
        <div class="row">
          <div class="col-md-6">
            <h1>Qwik Signal Implementation</h1>
          </div>
          <div class="col-md-6">
            <div class="row">
              <div class="col-sm-6 smallpad">
                <button
                  id="run"
                  class="btn btn-primary btn-block"
                  type="button"
                  onClick$={() => (data.value = buildData(1_000))}
                >
                  Create 1,000 rows
                </button>
              </div>
              <div class="col-sm-6 smallpad">
                <button
                  id="runlots"
                  class="btn btn-primary btn-block"
                  type="button"
                  onClick$={() => (data.value = buildData(10_000))}
                >
                  Create 10,000 rows
                </button>
              </div>
              <div class="col-sm-6 smallpad">
                <button
                  id="add"
                  class="btn btn-primary btn-block"
                  type="button"
                  onClick$={() => (data.value = [...data.value, ...buildData(1_000)])}
                >
                  Append 1,000 rows
                </button>
              </div>
              <div class="col-sm-6 smallpad">
                <button
                  id="update"
                  class="btn btn-primary btn-block"
                  type="button"
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
                  id="clear"
                  class="btn btn-primary btn-block"
                  type="button"
                  onClick$={() => (data.value = [])}
                >
                  Clear
                </button>
              </div>
              <div class="col-sm-6 smallpad">
                <button
                  id="swaprows"
                  class="btn btn-primary btn-block"
                  type="button"
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

import { component$, useStore } from "@qwik.dev/core";

let idCounter = 1;
const adjectives = [
    "pretty",
    "large",
    "big",
    "small",
    "tall",
    "short",
    "long",
    "handsome",
    "plain",
    "quaint",
    "clean",
    "elegant",
    "easy",
    "angry",
    "crazy",
    "helpful",
    "mushy",
    "odd",
    "unsightly",
    "adorable",
    "important",
    "inexpensive",
    "cheap",
    "expensive",
    "fancy",
  ],
  colours = [
    "red",
    "yellow",
    "blue",
    "green",
    "pink",
    "brown",
    "purple",
    "brown",
    "white",
    "black",
    "orange",
  ],
  nouns = [
    "table",
    "chair",
    "house",
    "bbq",
    "desk",
    "car",
    "pony",
    "cookie",
    "sandwich",
    "burger",
    "pizza",
    "mouse",
    "keyboard",
  ];

function _random(max: number) {
  return Math.round(Math.random() * 1000) % max;
}

export function buildData(count: number) {
  const data = new Array(count);
  for (let i = 0; i < count; i++) {
    data[i] = {
      id: idCounter++,
      label: `${adjectives[_random(adjectives.length)]} ${
        colours[_random(colours.length)]
      } ${nouns[_random(nouns.length)]}`,
    };
  }
  return data;
}

type BenchState = {
  data: Array<{ id: number; label: string }>;
  selected: number | null;
};
export default component$(() => {
  const state = useStore<BenchState>({ data: [], selected: null });
  return (
    <div class="container">
      <div class="jumbotron">
        <div class="row">
          <div class="col-md-6">
            <h1>Qwik Store Implementation</h1>
          </div>
          <div class="col-md-6">
            <div class="row">
              <div class="col-sm-6 smallpad">
                <button
                  id="run"
                  class="btn btn-primary btn-block"
                  type="button"
                  onClick$={() => (state.data = buildData(1000))}
                >
                  Create 1,000 rows
                </button>
              </div>
              <div class="col-sm-6 smallpad">
                <button
                  id="runlots"
                  class="btn btn-primary btn-block"
                  type="button"
                  onClick$={() => (state.data = buildData(10000))}
                >
                  Create 10,000 rows
                </button>
              </div>
              <div class="col-sm-6 smallpad">
                <button
                  id="add"
                  class="btn btn-primary btn-block"
                  type="button"
                  onClick$={() =>
                    (state.data = state.data.concat(buildData(1000)))
                  }
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
                    for (
                      let i = 0, d = state.data, len = d.length;
                      i < len;
                      i += 10
                    ) {
                      d[i].label += " !!!";
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
                  onClick$={() => (state.data = [])}
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
                    const d = state.data.slice();
                    if (d.length > 998) {
                      const tmp = d[1];
                      d[1] = d[998];
                      d[998] = tmp;
                      state.data = d;
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
          {state.data.map(({ id, label }) => {
            return (
              <tr key={id} class={id === state.selected ? "danger" : ""}>
                <td class="col-md-1">{id}</td>
                <td class="col-md-4">
                  <a onClick$={() => (state.selected = id)}>{label}</a>
                </td>
                <td class="col-md-1">
                  <a
                    onClick$={() => {
                      const d = state.data;
                      d.splice(
                        d.findIndex((d) => d.id === id),
                        1,
                      );
                    }}
                  >
                    <span aria-hidden="true">x</span>
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
});

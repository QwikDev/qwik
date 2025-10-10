import {
  component$,
  createSignal,
  untrack,
  useSignal,
  type QRL,
  type Signal,
} from "@qwik.dev/core";

const adjectives = ["pretty", "large", "big", "small", "tall", "short", "long", "handsome", "plain", "quaint", "clean", "elegant", "easy", "angry", "crazy", "helpful", "mushy", "odd", "unsightly", "adorable", "important", "inexpensive", "cheap", "expensive", "fancy"]; // prettier-ignore
const colors = ["red", "yellow", "blue", "green", "pink", "brown", "purple", "brown", "white", "black", "orange"]; // prettier-ignore
const nouns = ["table", "chair", "house", "bbq", "desk", "car", "pony", "cookie", "sandwich", "burger", "pizza", "mouse", "keyboard"]; // prettier-ignore

const random = (max: number) => Math.round(Math.random() * 1000) % max;

let nextId = 1;

type Row = {
  id: number;
  label: Signal<string>;
};

const buildData = (count: number) => {
  const data = new Array(count);
  for (let i = 0; i < count; i++) {
    const label = createSignal(
      `${adjectives[random(adjectives.length)]} ${colors[random(colors.length)]} ${nouns[random(nouns.length)]}`,
    );
    data[i] = createSignal({ id: nextId++, label });
  }
  return data;
};

type ButtonProps = {
  id: string;
  text: string;
  click$: QRL<() => void>;
};

const Button = component$<ButtonProps>(({ id, text, click$ }) => {
  return (
    <div class="col-sm-6 smallpad">
      <button
        id={id}
        class="btn btn-primary btn-block"
        type="button"
        onClick$={click$}
      >
        {text}
      </button>
    </div>
  );
});

export default component$(() => {
  const data = useSignal<Signal<Row>[]>([]);
  const selected = useSignal<number | null>(null);

  return (
    <div class="container">
      <div class="jumbotron">
        <div class="row">
          <div class="col-md-6">
            <h1>Qwik Signal Implementation</h1>
          </div>
          <div class="col-md-6">
            <div class="row">
              <Button
                id="run"
                text="Create 1,000 rows"
                click$={() => (data.value = buildData(1_000))}
              />
              <Button
                id="runlots"
                text="Create 10,000 rows"
                click$={() => (data.value = buildData(10_000))}
              />
              <Button
                id="add"
                text="Append 1,000 rows"
                click$={() =>
                  (data.value = [...data.value, ...buildData(1_000)])
                }
              />
              <Button
                id="update"
                text="Update every 10th row"
                click$={() => {
                  const dataValue = untrack(() => data.value);
                  for (
                    let i = 0, d = dataValue, len = d.length;
                    i < len;
                    i += 10
                  ) {
                    d[i].value.label.value += " !!!";
                  }
                }}
              />
              <Button
                id="clear"
                text="Clear"
                click$={() => (data.value = [])}
              />
              <Button
                id="swaprows"
                text="Swap Rows"
                click$={() => {
                  const list = data.value;
                  if (list.length > 998) {
                    const item = list[1].value;
                    list[1].value = list[998].value;
                    list[998].value = item;
                  }
                }}
              />
            </div>
          </div>
        </div>
      </div>
      <table class="table table-hover table-striped test-data">
        <tbody>
          {data.value.map((row) => {
            return (
              <tr
                key={untrack(() => row.value.id)}
                class={selected.value === row.value.id ? "danger" : ""}
              >
                <td class="col-md-1">{row.value.id}</td>
                <td class="col-md-4">
                  <a onClick$={() => (selected.value = row.value.id)}>
                    {row.value.label.value}
                  </a>
                </td>
                <td class="col-md-1">
                  <a
                    onClick$={() => {
                      const dataValue = untrack(() => data.value);
                      const currentRow = row.value;
                      data.value = dataValue.toSpliced(
                        dataValue.findIndex(
                          (d) => d.value.id === currentRow.id,
                        ),
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

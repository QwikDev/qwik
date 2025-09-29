import {
  component$,
  useSignal,
  useStore,
  $,
  type QwikIntrinsicElements,
  type FunctionComponent,
  createContextId,
  useContext,
  useContextProvider,
} from "@qwik.dev/core";

type Item = { id: number; label: string; selected: boolean };

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

export function buildData(count: number): Item[] {
  const data: Item[] = new Array(count);
  for (let i = 0; i < count; i++) {
    data[i] = {
      id: idCounter++,
      label: `${adjectives[_random(adjectives.length)]} ${
        colours[_random(colours.length)]
      } ${nouns[_random(nouns.length)]}`,
      selected: false,
    };
  }
  return data;
}

const helpers = createContextId<{
  reset$: (count: number) => void;
  update$: () => void;
  add$: () => void;
  swap$: () => void;
  select$: (item: Item) => void;
  delete$: (item: Item) => void;
}>("h");

const Button: FunctionComponent<QwikIntrinsicElements["button"]> = (props) => (
  <div class="col-sm-6 smallpad">
    <button type="button" class="btn btn-primary btn-block" {...props} />
  </div>
);

const Row = component$<{
  item: Item;
}>(({ item }) => {
  const { select$, delete$ } = useContext(helpers);
  return (
    <tr class={item.selected ? "danger" : ""}>
      <td class="col-md-1">{item.id}</td>
      <td class="col-md-4">
        <a onClick$={() => select$(item)}>{item.label}</a>
      </td>
      <td class="col-md-1">
        <a onClick$={() => delete$(item)}>
          <span aria-hidden="true">x</span>
        </a>
      </td>
      <td class="col-md-6" />
    </tr>
  );
});

const Table = component$<{
  data: Item[];
}>(({ data }) => (
  <table class="table table-hover table-striped test-data">
    <tbody>
      {data.map((item) => (
        <Row key={item.id} item={item} />
      ))}
    </tbody>
  </table>
));

export const Buttons = component$(() => {
  const h = useContext(helpers);
  return (
    <>
      <Button id="run" onClick$={() => h.reset$(1000)}>
        Create 1,000 rows
      </Button>
      <Button id="runlots" onClick$={() => h.reset$(10000)}>
        Create 10,000 rows
      </Button>
      <Button id="add" onClick$={h.add$}>
        Append 1,000 rows
      </Button>
      <Button id="update" onClick$={h.update$}>
        Update every 10th row
      </Button>
      <Button id="clear" onClick$={() => h.reset$(0)}>
        Clear
      </Button>
      <Button id="swaprows" onClick$={h.swap$}>
        Swap Rows
      </Button>
    </>
  );
});

type BenchState = {
  data: Item[];
};
export default component$(() => {
  const state = useStore<BenchState>({ data: [] });
  const selectedItem = useSignal<Item | null>(null);
  const redraw = useSignal(0);
  useContextProvider(helpers, {
    reset$: $((count: number) => {
      state.data = buildData(count);
      selectedItem.value = null;
      redraw.value++;
    }),
    update$: $(() => {
      for (let i = 0, d = state.data, len = d.length; i < len; i += 10) {
        d[i].label += " !!!";
      }
    }),
    add$: $(() => state.data.push(...buildData(1000))),
    swap$: $(() => {
      const d = state.data;
      if (d.length > 998) {
        const tmp = d[1];
        d[1] = d[998];
        d[998] = tmp;
      }
    }),
    select$: $((item: Item) => {
      if (selectedItem.value) {
        selectedItem.value.selected = false;
      }
      selectedItem.value = item;
      item.selected = true;
    }),
    delete$: $((item: Item) => {
      state.data.splice(state.data.indexOf(item), 1);
      if (selectedItem.value === item) {
        selectedItem.value = null;
      }
    }),
  });

  return (
    <div class="container">
      <div class="jumbotron">
        <div class="row">
          <div class="col-md-6">
            <h1>Qwik Component Implementation</h1>
          </div>
          <div class="col-md-6">
            <div class="row">
              <Buttons />
            </div>
          </div>
        </div>
      </div>
      <Table key={redraw.value} data={state.data} />
      <span class="preloadicon glyphicon glyphicon-remove" aria-hidden="true" />
    </div>
  );
});

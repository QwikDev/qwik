import { component$, createSignal, getPlatform, setPlatform, type JSXOutput } from '@qwik.dev/core';
import { getDomContainer } from '../client/dom-container';
import { render } from '../client/dom-render';
import { _serialize } from '../shared/serdes/serdes.public';
import { renderToString } from '../../server/ssr-render';
import { createDocument } from '../../testing/document';
import { waitForDrain } from '../../testing/util';

export interface BenchmarkScenario {
  id: string;
  title: string;
  /** Returns the size of the result (e.g. bytes of HTML), or 0 if not applicable */
  run: () => Promise<number>;
}

type TableRow = {
  id: number;
  label: string;
  value: number;
};

const makeRows = (count: number): TableRow[] => {
  let state = 0x1234abcd;
  const rows = new Array<TableRow>(count);
  for (let i = 0; i < count; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    rows[i] = {
      id: i + 1,
      label: `row-${i}-${state & 0xffff}`,
      value: state & 0x3ff,
    };
  }
  return rows;
};

const makeUpdatedRows = (rows: TableRow[]): TableRow[] => {
  const nextRows = rows.map((row, index) => ({
    id: row.id,
    label: `${row.label}-next-${(index * 13 + row.value) % 17}`,
    value: (row.value * 7 + index * 11) % 2048,
  }));

  if (nextRows.length > 4) {
    const reordered = [...nextRows];
    const moved = reordered.splice(1, 3);
    reordered.splice(reordered.length - 1, 0, ...moved);
    return reordered;
  }

  return nextRows.reverse();
};

const rows10 = makeRows(10);
const rows1000 = makeRows(1000);
const updatedRows1000 = makeUpdatedRows(rows1000);

const sharedMeta = {
  adjectives: ['pretty', 'large', 'small', 'helpful'],
  colours: ['red', 'green', 'blue', 'black'],
  nouns: ['table', 'chair', 'keyboard', 'mouse'],
};

const makeSerializableState = (count: number) => {
  const items = new Array(count);
  for (let i = 0; i < count; i++) {
    items[i] = {
      id: i + 1,
      label: `item-${i}`,
      flags: [i % 2 === 0, i % 3 === 0, i % 5 === 0],
      meta: sharedMeta,
      nested: {
        score: (i * 17) % 97,
        tags: [`tag-${i % 7}`, `tag-${i % 11}`],
      },
    };
  }

  return {
    items,
    summary: {
      count,
      first: items[0],
      last: items[items.length - 1],
    },
  };
};

const serializableState1k = makeSerializableState(1000);

const renderTable = (rows: TableRow[]): JSXOutput => {
  return (
    <table class="bench-table">
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} onClick$={() => console.warn('hi', row.id)}>
            <td>{row.id}</td>
            <td>{row.label}</td>
            <td>{row.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const renderSsr = async (jsx: JSXOutput): Promise<number> => {
  const platform = getPlatform();
  try {
    const result = await renderToString(jsx, { qwikLoader: 'never', containerTagName: 'div' });
    return result.html.length;
  } finally {
    setPlatform(platform);
  }
};

const renderDom = async (jsx: JSXOutput): Promise<number> => {
  const document = createDocument();
  await render(document.body, jsx);
  return 0;
};

const renderDomUpdate = async (initialRows: TableRow[], nextRows: TableRow[]): Promise<number> => {
  const document = createDocument();
  const rows = createSignal(initialRows);
  const App = component$(() => {
    return renderTable(rows.value);
  });
  await render(document.body, <App />);
  rows.value = nextRows;
  await waitForDrain(getDomContainer(document.body));
  return 0;
};

const makeScenario = (id: string, rowCount: number, rows: TableRow[]): BenchmarkScenario => {
  return {
    id,
    title: `SSR table ${rowCount} rows`,
    run: () => renderSsr(renderTable(rows)),
  };
};

const makeDomScenario = (id: string, rowCount: number, rows: TableRow[]): BenchmarkScenario => {
  return {
    id,
    title: `DOM table ${rowCount} rows`,
    run: async () => {
      await renderDom(renderTable(rows));
      return 0;
    },
  };
};

const makeDomUpdateScenario = (
  id: string,
  rowCount: number,
  initialRows: TableRow[],
  nextRows: TableRow[]
): BenchmarkScenario => {
  return {
    id,
    title: `DOM update table ${rowCount} rows`,
    run: async () => {
      await renderDomUpdate(initialRows, nextRows);
      return 0;
    },
  };
};

export const scenarios: BenchmarkScenario[] = [
  makeScenario('ssr-table-10', 10, rows10),
  makeScenario('ssr-table-1k', 1000, rows1000),
  makeDomScenario('dom-table-10', 10, rows10),
  makeDomScenario('dom-table-1k', 1000, rows1000),
  makeDomUpdateScenario('dom-update-table-1k', 1000, rows1000, updatedRows1000),
  {
    id: 'serialize-state-1k',
    title: 'Serialize 1k-item state graph',
    run: async () => {
      const result = await _serialize(serializableState1k);
      return result.length;
    },
  },
];

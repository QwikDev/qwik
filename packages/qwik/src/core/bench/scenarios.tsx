import type { JSXOutput } from '@qwik.dev/core';
import { _serialize } from '../shared/serdes/serdes.public';
import { renderToString } from '../../server/ssr-render';

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

const rows10 = makeRows(10);
const rows1000 = makeRows(1000);
const rows10000 = makeRows(10000);

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

const render = async (jsx: JSXOutput): Promise<number> => {
  const result = await renderToString(jsx, { qwikLoader: 'never', containerTagName: 'div' });
  return result.html.length;
};

const makeScenario = (id: string, rowCount: number, rows: TableRow[]): BenchmarkScenario => {
  return {
    id,
    title: `SSR table ${rowCount} rows`,
    run: () => render(renderTable(rows)),
  };
};

export const scenarios: BenchmarkScenario[] = [
  makeScenario('ssr-table-10', 10, rows10),
  makeScenario('ssr-table-1k', 1000, rows1000),
  makeScenario('ssr-table-10k', 10000, rows10000),
  {
    id: 'serialize-state-1k',
    title: 'Serialize 1k-item state graph',
    run: async () => {
      const result = await _serialize(serializableState1k);
      return result.length;
    },
  },
];

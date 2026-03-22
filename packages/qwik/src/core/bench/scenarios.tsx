import { setPlatform, type JSXOutput } from '@qwik.dev/core';
import { renderToString } from '../../server/ssr-render';
import { createDocument } from '../../testing/document';
import { getTestPlatform } from '../../testing/platform';
import { waitForDrain } from '../../testing/util';
import { getDomContainer } from '../client/dom-container';
import { render } from '../client/dom-render';
import { _serialize } from '../shared/serdes/serdes.public';

// `vitest bench` does not reliably inherit the regular test setup hook, so make sure
// benchmark DOM renders always use the client test platform and flush their journal.
const platform = getTestPlatform();
setPlatform(platform);

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

const makeSsrScenario = (id: string, rowCount: number, rows: TableRow[]): BenchmarkScenario => {
  const jsx = renderTable(rows);
  return {
    id,
    title: `SSR table ${rowCount} rows`,
    run: async () => {
      try {
        const result = await renderToString(jsx, { qwikLoader: 'never', containerTagName: 'div' });
        return result.html.length;
      } finally {
        // SSR installs its own server platform, so restore the client test platform after every sample.
        setPlatform(platform);
      }
    },
  };
};

const makeDomScenario = (id: string, rowCount: number, rows: TableRow[]): BenchmarkScenario => {
  const jsx = renderTable(rows);
  return {
    id,
    title: `DOM table ${rowCount} rows`,
    run: async () => {
      // Tinybench bench-level setup/teardown run once per warmup/run, not once per sample,
      // so DOM scenarios need to create their own fresh document on every invocation.
      const document = createDocument();
      await render(document.body, jsx);
      await waitForDrain(getDomContainer(document.body));
      const renderedRowCount = document.querySelectorAll('.bench-table tr').length;
      if (renderedRowCount !== rows.length) {
        throw new Error(
          `Expected ${rows.length} rows in the DOM, but found ${renderedRowCount}.\n${document.body.outerHTML}`
        );
      }
      return 0;
    },
  };
};

export const scenarios: BenchmarkScenario[] = [
  makeSsrScenario('ssr-table-10', 10, rows10),
  makeSsrScenario('ssr-table-1k', 1000, rows1000),
  makeDomScenario('dom-table-10', 10, rows10),
  makeDomScenario('dom-table-1k', 1000, rows1000),
  // DOM update is super fast, hard to compare here, the overhead of the test DOM is too high.
  {
    id: 'serialize-state-1k',
    title: 'Serialize 1k-item state graph',
    run: async () => {
      const result = await _serialize(serializableState1k);
      return result.length;
    },
  },
];

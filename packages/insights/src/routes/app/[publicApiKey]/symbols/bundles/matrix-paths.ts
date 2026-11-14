import type { MatrixPath } from '~/stats/edges';

export function readMatrixRows(paths: MatrixPath[], rows: number[], columns: number[]): number[][] {
  const rowIndexes = new Map(rows.map((row, index) => [row, index]));
  const columnIndexes = new Map(columns.map((column, index) => [column, index]));
  const values = rows.map(() => columns.map(() => 0));
  paths.forEach(([symbol, parent], pathIndex) => {
    const rowIndex = rowIndexes.get(symbol);
    if (rowIndex === undefined) {
      return;
    }
    const row = values[rowIndex];
    const self = columnIndexes.get(symbol);
    if (self !== undefined) {
      row[self] = 1;
    }
    let weight = 1;
    let current = pathIndex;
    while (parent >= 0) {
      weight *= paths[current][2];
      const column = columnIndexes.get(paths[parent][0]);
      if (column !== undefined) {
        row[column] = Math.min(1, row[column] + weight);
      }
      current = parent;
      parent = paths[parent][1];
    }
  });
  return values;
}

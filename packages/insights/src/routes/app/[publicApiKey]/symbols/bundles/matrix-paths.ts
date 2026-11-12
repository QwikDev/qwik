import type { MatrixPath } from '~/stats/edges';

export function readMatrixRows(paths: MatrixPath[], rows: number[], columns: number[]): number[][] {
  return createMatrixReader(paths)(rows, columns);
}

export function createMatrixReader(paths: MatrixPath[]) {
  const pathsBySymbol = new Map<number, number[]>();
  paths.forEach(([symbol], index) => {
    const indexes = pathsBySymbol.get(symbol) ?? [];
    indexes.push(index);
    pathsBySymbol.set(symbol, indexes);
  });
  return (rows: number[], columns: number[]): number[][] => {
    const columnIndexes = new Map(columns.map((column, index) => [column, index]));
    const values = rows.map(() => columns.map(() => 0));
    rows.forEach((symbol, rowIndex) => {
      for (const pathIndex of pathsBySymbol.get(symbol) ?? []) {
        let parent = paths[pathIndex][1];
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
      }
    });
    return values;
  };
}

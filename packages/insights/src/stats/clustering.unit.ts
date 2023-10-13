import { DBSCAN } from 'density-clustering';
import { assert, test } from 'vitest';

test('dbscan', () => {
  const dataset = [
    [1, 1],
    [0, 1],
    [1, 0],
    [10, 10],
    [10, 13],
    [13, 13],
    [54, 54],
    [55, 55],
    [89, 89],
    [57, 55],
  ];

  const dbscan = new DBSCAN();

  const clusters = dbscan.run(dataset, 5, 2);
  assert.deepEqual(clusters, [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 9],
  ]);
  assert.deepEqual(dbscan.noise, [8]);
});

import { test } from 'uvu';
import * as assert from 'uvu/assert';
import { DBSCAN } from 'density-clustering';

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
  console.log(clusters, dbscan.noise);
  assert.equal(clusters, [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 9],
  ]);
  assert.equal(dbscan.noise, [8]);
});

test.run();

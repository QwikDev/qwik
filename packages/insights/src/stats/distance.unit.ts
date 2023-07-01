import { test } from 'uvu';
import * as assert from 'uvu/assert';
import { computeDistanceMatrix } from './distance';

test('unit distance', () => {
  const distances = computeDistanceMatrix([[1], [1]]);
  assert.equal(distances, [
    [0, 0],
    [0, 0],
  ]);
});

test('2d distance', () => {
  const distances = computeDistanceMatrix([
    [3, 0],
    [0, 4],
  ]);
  assert.equal(distances, [
    [0, 5],
    [5, 0],
  ]);
});

test('3d distance', () => {
  const distances = computeDistanceMatrix([
    [3, 0, 0],
    [0, 4, 0],
    [0, 0, 1],
  ]);
  assert.equal(distances, [
    [0, 5, 3.1622776601683795],
    [5, 0, 4.123105625617661],
    [3.1622776601683795, 4.123105625617661, 0],
  ]);
});

test.run();

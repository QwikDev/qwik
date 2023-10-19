import { assert, test } from 'vitest';
import {
  MAX_VALUE,
  NUMBER_OF_BUCKETS,
  TIMELINE_MAX_VALUE,
  fromBucket,
  toBucket,
  toBucketTimeline,
} from './vector';

test('bucketize values', () => {
  // let previousBucket = -1;
  // let value = 0;
  // while (previousBucket < NUMBER_OF_BUCKETS - 1) {
  //   const bucket = toBucket(value);
  //   if (previousBucket !== bucket) {
  //     console.log(value, '->', bucket);
  //     previousBucket = bucket;
  //   }
  //   value++;
  // }
  assert.equal(toBucket(0), 0);
  assert.equal(toBucket(1), 1);
  assert.equal(toBucket(2), 2);
  assert.equal(toBucket(3), 3);
  assert.equal(toBucket(4), 4);
  assert.equal(toBucket(5), 4);
  assert.equal(toBucket(6), 5);
  assert.equal(toBucket(7), 5);
  assert.equal(toBucket(8), 6);
  assert.equal(toBucket(9), 6);
  assert.equal(toBucket(10), 7);
  assert.equal(toBucket(MAX_VALUE), NUMBER_OF_BUCKETS - 1);
  assert.equal(toBucket(Number.MAX_SAFE_INTEGER), NUMBER_OF_BUCKETS - 1);
  assert.equal(toBucket(MAX_VALUE - 1), NUMBER_OF_BUCKETS - 2);
});

test('debucketize', () => {
  assert.deepEqual(fromBucket(0), { min: 0, max: 1, avg: 0.5 });
  assert.deepEqual(fromBucket(1), { min: 1, max: 2, avg: 1.5 });
  assert.deepEqual(fromBucket(NUMBER_OF_BUCKETS - 1).min, MAX_VALUE);
});

test('bucketize timeline values', () => {
  // let previousBucket = -1;
  // let value = 0;
  // while (previousBucket < NUMBER_OF_BUCKETS - 1) {
  //   const bucket = toBucketTimeline(value);
  //   if (previousBucket !== bucket) {
  //     console.log(value, '->', bucket);
  //     previousBucket = bucket;
  //   }
  //   value++;
  // }
  assert.equal(toBucketTimeline(0), 0);
  assert.equal(toBucketTimeline(70), 1);
  assert.equal(toBucketTimeline(233), 2);
  assert.equal(toBucketTimeline(425), 3);
  assert.equal(toBucketTimeline(640), 4);
  assert.equal(toBucketTimeline(800), 4);
  assert.equal(toBucketTimeline(900), 5);
  assert.equal(toBucketTimeline(950), 5);
  assert.equal(toBucketTimeline(1200), 6);
  assert.equal(toBucketTimeline(1400), 6);
  assert.equal(toBucketTimeline(1800), 7);
  assert.equal(toBucketTimeline(TIMELINE_MAX_VALUE), NUMBER_OF_BUCKETS - 1);
  assert.equal(toBucketTimeline(Number.MAX_SAFE_INTEGER), NUMBER_OF_BUCKETS - 1);
  assert.equal(toBucketTimeline(TIMELINE_MAX_VALUE - 1), NUMBER_OF_BUCKETS - 2);
});

import { test } from 'uvu';
import * as assert from 'uvu/assert';
import {
  MAX_VALUE,
  NUMBER_OF_BUCKETS,
  TIMELINE_MAX_VALUE,
  fromBucket,
  toBucket,
  toBucketTimeline,
} from './vector';

test.only('bucketize values', () => {
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
  assert.is(toBucket(0), 0);
  assert.is(toBucket(1), 1);
  assert.is(toBucket(2), 2);
  assert.is(toBucket(3), 3);
  assert.is(toBucket(4), 4);
  assert.is(toBucket(5), 4);
  assert.is(toBucket(6), 5);
  assert.is(toBucket(7), 5);
  assert.is(toBucket(8), 6);
  assert.is(toBucket(9), 6);
  assert.is(toBucket(10), 7);
  assert.is(toBucket(MAX_VALUE), NUMBER_OF_BUCKETS - 1);
  assert.is(toBucket(Number.MAX_SAFE_INTEGER), NUMBER_OF_BUCKETS - 1);
  assert.is(toBucket(MAX_VALUE - 1), NUMBER_OF_BUCKETS - 2);
});

test.only('debucketize', () => {
  assert.equal(fromBucket(0), { min: 0, max: 1, avg: 0.5 });
  assert.equal(fromBucket(1), { min: 1, max: 2, avg: 1.5 });
  assert.equal(fromBucket(NUMBER_OF_BUCKETS - 1).min, MAX_VALUE);
});

test.only('bucketize timeline values', () => {
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
  assert.is(toBucketTimeline(0), 0);
  assert.is(toBucketTimeline(70), 1);
  assert.is(toBucketTimeline(233), 2);
  assert.is(toBucketTimeline(425), 3);
  assert.is(toBucketTimeline(640), 4);
  assert.is(toBucketTimeline(800), 4);
  assert.is(toBucketTimeline(900), 5);
  assert.is(toBucketTimeline(950), 5);
  assert.is(toBucketTimeline(1200), 6);
  assert.is(toBucketTimeline(1400), 6);
  assert.is(toBucketTimeline(1800), 7);
  assert.is(toBucketTimeline(TIMELINE_MAX_VALUE), NUMBER_OF_BUCKETS - 1);
  assert.is(toBucketTimeline(Number.MAX_SAFE_INTEGER), NUMBER_OF_BUCKETS - 1);
  assert.is(toBucketTimeline(TIMELINE_MAX_VALUE - 1), NUMBER_OF_BUCKETS - 2);
});

test.run();

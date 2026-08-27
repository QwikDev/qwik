import { assert, test } from 'vitest';
import { Slugger } from './slugger';

test('basic text is lowercased and spaces become dashes', () => {
  const slugger = new Slugger();
  assert.equal(slugger.slug('Getting Started'), 'getting-started');
});

test('punctuation is stripped', () => {
  const slugger = new Slugger();
  assert.equal(slugger.slug(`What's new? (v2.0)`), 'whats-new-v20');
});

test('underscores and hyphens are kept', () => {
  const slugger = new Slugger();
  assert.equal(slugger.slug('use_task - api'), 'use_task---api');
});

test('leading and trailing whitespace is trimmed', () => {
  const slugger = new Slugger();
  assert.equal(slugger.slug('  Hello World  '), 'hello-world');
});

test('unicode letters are preserved', () => {
  const slugger = new Slugger();
  assert.equal(slugger.slug('Héllo Wörld'), 'héllo-wörld');
});

test('duplicate slugs get numeric suffixes', () => {
  const slugger = new Slugger();
  assert.equal(slugger.slug('Intro'), 'intro');
  assert.equal(slugger.slug('Intro'), 'intro-1');
  assert.equal(slugger.slug('Intro'), 'intro-2');
});

test('suffixed duplicates do not collide with explicit headings', () => {
  const slugger = new Slugger();
  assert.equal(slugger.slug('foo'), 'foo');
  assert.equal(slugger.slug('foo 1'), 'foo-1');
  assert.equal(slugger.slug('foo'), 'foo-2');
});

test('each instance tracks its own occurrences', () => {
  const a = new Slugger();
  const b = new Slugger();
  assert.equal(a.slug('same'), 'same');
  assert.equal(b.slug('same'), 'same');
});

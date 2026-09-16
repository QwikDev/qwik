import { Project } from 'ts-morph';
import { afterEach, describe, expect, test } from 'vitest';
import { takeWarnings } from '../report';
import { keepV1EventNames, v1JsxEvent, v2JsxEvent } from './events';

const run = (code: string) => {
  const file = new Project({ useInMemoryFileSystem: true }).createSourceFile('a.tsx', code);
  const changed = keepV1EventNames(file);
  return { changed, text: file.getFullText() };
};

describe('event names', () => {
  afterEach(() => takeWarnings());

  test('v1 and v2 JSX event name rules', () => {
    expect([v1JsxEvent('Click'), v2JsxEvent('Click')]).toEqual(['click', 'click']);
    expect([v1JsxEvent('My-Event'), v2JsxEvent('My-Event')]).toEqual(['myEvent', 'my-event']);
    expect([v1JsxEvent('-myEvent'), v2JsxEvent('-myEvent')]).toEqual(['myEvent', 'myEvent']);
    expect([v1JsxEvent('-my-event'), v2JsxEvent('-my-event')]).toEqual(['myEvent', 'my-event']);
    expect([v1JsxEvent('DOMContentLoaded'), v2JsxEvent('DOMContentLoaded')]).toEqual([
      'domcontentloaded',
      'DOMContentLoaded',
    ]);
    expect(v1JsxEvent('A-1')).toBeUndefined();
  });

  test('rewrites JSX event props on DOM elements', () => {
    expect(
      run(
        [
          `<div onClick$={a} onMy-Event$={b} on-my-event$={c} document:onFoo-Bar$={d} window:on-fooBar$={e} />;`,
          `<span on-Custom$={f}></span>;`,
        ].join('\n')
      )
    ).toEqual({
      changed: true,
      text: [
        `<div onClick$={a} on-myEvent$={b} on-myEvent$={c} document:on-fooBar$={d} window:on-fooBar$={e} />;`,
        `<span on-Custom$={f}></span>;`,
      ].join('\n'),
    });
  });

  test('warns instead of renaming props of components', () => {
    const code = `<Button onMy-Event$={b} />;`;
    expect(run(code)).toEqual({ changed: false, text: code });
    expect(takeWarnings()).toEqual([
      '/a.tsx: `<Button onMy-Event$>` listens to "my-event" in v2 instead of "myEvent".',
    ]);
  });

  test('rewrites useOn event names', () => {
    expect(
      run(
        [
          `import { useOn, useOnWindow } from '@builder.io/qwik';`,
          `useOn('my-event', a);`,
          `useOnWindow(['resize', 'foo-bar', 'DOMContentLoaded'], b);`,
        ].join('\n')
      ).text
    ).toBe(
      [
        `import { useOn, useOnWindow } from '@builder.io/qwik';`,
        `useOn('myEvent', a);`,
        `useOnWindow(['resize', 'fooBar', 'DOMContentLoaded'], b);`,
      ].join('\n')
    );
  });

  test('warns about names that never ran in v1', () => {
    run(
      [
        `import { useOn } from '@builder.io/qwik';`,
        `useOn('my--event', a);`,
        `<div onA-1$={b} />;`,
      ].join('\n')
    );
    expect(takeWarnings()).toHaveLength(2);
  });
});

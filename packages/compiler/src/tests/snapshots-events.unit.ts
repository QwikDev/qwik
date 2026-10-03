/** Golden snapshots: events, bindings and sync handlers. */
import { describe, expect, test } from 'vitest';
import { testInput, testInputs } from './snapshot-runner';

describe.each(['ssr', 'csr'] as const)('%s', (mode) => {
  test('should emit block event handlers through the shared QRL emitter', async () => {
    const output = await testInput(mode, 'event-block-body', {
      code: `import { useSignal } from '@qwik.dev/core';
export const Button = (props) => <button onClick$={props.onSave$}>save</button>;
export default () => {
  const count = useSignal(0);
  return <Button onSave$={() => {
    const next = count.value + 1;
    if (next > 10) return;
    count.value = next;
  }} />;
};`,
    });
    expect(output.diagnostics).toEqual([]);
  });

  test('should extract native function event handlers', async () => {
    await testInput(mode, 'event-function-handlers', {
      code: `export const Button = (props) => <button onClick$={props.onSave$}>save</button>;
export default (props) => <main>
  <button onClick$={function onClick(event) { return [this, arguments.length, event.type]; }}>plain</button>
  <Button onSave$={function save(value = props.initial) { return props.onSave$(value); }} />
  <button onClick$={async function (event) { await Promise.resolve(); return props.onSave$(event.type); }}>async</button>
</main>;`,
    });
  });

  test('should preserve event parameter patterns and captured defaults', async () => {
    await testInput(mode, 'event-parameter-patterns', {
      code: `export const Button = (props) => <button onClick$={props.onSave$}>save</button>;
export default () => {
  const fallback = 'click';
  return <Button
    onSave$={({ type = fallback } = {}, ...rest) => [type, rest.length]}
    onReset$={([first, ...rest], { id = 'button' }) => [first, rest, id]}
  />;
};`,
    });
  });

  test('should capture component props in event bodies and defaults', async () => {
    await testInput(mode, 'event-props-captures', {
      code: `export const Button = (props) => <button onClick$={props.onSave$}>save</button>;
export default (input) => {
  const suffix = '!';
  return <main>
    <button onClick$={() => input.onSave$(input.id + suffix)}>save</button>
    <Button onSave$={({ value = input.initial } = {}) => input.onSave$(value)} />
  </main>;
};`,
    });
  });

  test('should capture a signal in an event handler', async () => {
    await testInput(mode, 'capturing-event', {
      code: `import { useSignal } from '@qwik.dev/core';
export default () => {
  const count = useSignal(0);
  return <button onClick$={() => count.value++}>go</button>;
};
`,
    });
  });

  test('should wire an event handler without captures', async () => {
    await testInput(mode, 'event-no-captures', {
      code: `export default () => {
  return <button onClick$={() => console.log(1)}>go</button>;
};
`,
    });
  });

  test('should wire an event handler with a parameter', async () => {
    await testInput(mode, 'event-with-param', {
      code: `export default () => {
  return <button onDblClick$={(ev) => console.log(ev)}>go</button>;
};
`,
    });
  });

  test('should wire an event handler alongside static attributes', async () => {
    await testInput(mode, 'event-alongside-static-attrs', {
      code: `export default () => {
  return <button class="cta" onClick$={() => console.log(1)} hidden>go</button>;
};
`,
    });
  });

  test('should inline sync$ handlers under a stable key', async () => {
    const output = await testInput(mode, 'sync-handlers', {
      code: `import { sync$ } from '@qwik.dev/core';
export const stop = sync$((event: Event) => event.preventDefault());
export default () => (
  <a href="/x" onClick$={sync$((_event: Event, element: Element) => element.setAttribute('data-sync', 'ran'))}>
    go
  </a>
);
`,
    });
    expect(output.diagnostics).toEqual([]);
    const main = output.modules.find((module) => module.path === 'src/component.tsx')!.code;
    // The function stays inline under its symbol; no chunk is produced for it. A client event
    // takes the plain function; only a value needs the QRL.
    expect(main.match(/_qrlSync\(\w+, "\w+"(?:, "(?:[^"\\]|\\.)*")?\)/g)).toHaveLength(
      mode === 'ssr' ? 2 : 1
    );
    // the server writes the source into the HTML, so it arrives minified
    if (mode === 'ssr') {
      expect(main).toContain('"e=>e.preventDefault()"');
      // its table entry is written right before the element that uses it
      expect(main).toMatch(/ctx\.syncFn\(q_\w+\),\s*["']<a href=/);
    }
    expect(main).not.toContain('sync$(');
    expect(output.modules.filter((module) => module.path.includes('sync'))).toHaveLength(0);
  });

  test('should extract every function of an event handler array', async () => {
    const output = await testInput(mode, 'event-handler-arrays', {
      code: `import { $, useSignal } from '@qwik.dev/core';
export default () => {
  const count = useSignal(0);
  const log = $(() => console.log(count.value));
  return (
    <button onClick$={[() => count.value++, [undefined, () => (count.value += 2)], null, log]}>
      {count.value}
    </button>
  );
};
`,
    });
    expect(output.diagnostics).toEqual([]);
    const main = output.modules.find((module) => module.path === 'src/component.tsx')!.code;
    // Nested arrays flatten, empty entries drop, each function is its own event QRL.
    expect(main).toMatch(
      mode === 'ssr'
        ? /eventAttrParts\("q-e:click", \[q_\w+\.w\(\[count\]\), q_\w+\.w\(\[count\]\), log\]\)/
        : /setEvent\(el0, "q-e:click", \[createCapturedEvent\(\w+, \[count\]\), createCapturedEvent\(\w+, \[count\]\), log\]\)/
    );
  });

  test('should scope window and document events and keep event modifiers', async () => {
    const output = await testInput(mode, 'event-scopes-modifiers', {
      code: `import { useSignal } from '@qwik.dev/core';
export default () => {
  const count = useSignal(0);
  return (
    <div window:onDblClick$={() => count.value++} document:onScroll$={() => count.value++} passive:scroll>
      <a href="/x" preventdefault:click stoppropagation:click capture:click onClick$={() => count.value++}>
        go
      </a>
    </div>
  );
};
`,
    });
    const code = output.modules.map((module) => module.code).join('\n');
    expect(code).toContain('"q-w:dblclick"');
    expect(code).toContain('"q-dp:scroll"');
    for (const modifier of ['preventdefault:click', 'stoppropagation:click', 'capture:click']) {
      expect(code).toContain(modifier);
    }
    expect(code).not.toContain('passive:');
  });

  test('should drop preventdefault only for active passive events', async () => {
    const output = await testInput(mode, 'event-passive-preventdefault', {
      code: `import { component$ } from '@qwik.dev/core';
export default component$(() => (
  <div>
    <button passive:click preventdefault:click stoppropagation:click capture:click onClick$={() => console.log('passive')} />
    <button preventdefault:scroll preventdefault:click passive:scroll onClick$={() => console.log('regular')} onScroll$={() => console.log('scroll')} />
    <button passive:click={false} preventdefault:click onClick$={() => console.log('disabled')} />
    <button passive:dblClick preventdefault:dblclick onDblClick$={() => console.log('normalized')} />
  </div>
));
`,
    });
    expect(output.diagnostics).toEqual([]);
    const main = output.modules.find((module) => module.path === 'src/component.tsx')!.code;
    expect(main.match(/preventdefault:click/g)).toHaveLength(2);
    expect(main).not.toContain('preventdefault:scroll');
    expect(main).not.toContain('preventdefault:dblclick');
    expect(main).toContain('stoppropagation:click');
    expect(main).toContain('capture:click');
    expect(main).toContain('"q-ep:click"');
    expect(main).toContain('"q-e:click"');
    expect(main).toContain('"q-ep:scroll"');
    expect(main).toContain('"q-ep:dblclick"');
  });

  test('should bind inputs both ways through the runtime bind handlers', async () => {
    const output = await testInput(mode, 'element-bind', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
export default component$(() => {
  const checked = useSignal(false);
  const text = useSignal('one');
  return (
    <form>
      <input type="checkbox" bind:checked={checked} />
      <textarea bind:value={text} />
    </form>
  );
});
`,
    });
    expect(output.diagnostics).toEqual([]);
    const main = output.modules.find((module) => module.path === 'src/component.tsx')!.code;
    // The signal drives the property; the runtime handler writes the input back into it.
    expect(main).toContain('"checked", checked');
    expect(main).toContain('"value", text');
    expect(main).toContain("inlinedQrl(_chk, '_chk', [checked])");
    expect(main).toContain("inlinedQrl(_val, '_val', [text])");
    expect(main).not.toContain('bind:');
  });

  test('should preserve binds when dynamic input handlers change', async () => {
    const output = await testInput(mode, 'element-bind-dynamic-event', {
      code: `import { $, component$, useSignal } from '@qwik.dev/core';
export default component$(() => {
  const enabled = useSignal(false);
  const text = useSignal('one');
  const checked = useSignal(false);
  const action = $(() => console.log(text.value, checked.value));
  return (
    <form>
      <input onInput$={enabled.value ? action : undefined} bind:value={text} />
      <input bind:value={text} onInput$={enabled.value ? action : undefined} />
      <input type="checkbox" onInput$={enabled.value ? action : undefined} bind:checked={checked} />
      <input type="checkbox" bind:checked={checked} onInput$={enabled.value ? action : undefined} />
    </form>
  );
});
`,
    });
    expect(output.diagnostics).toEqual([]);
  });

  test('should pass handler arrays to components as QRL lists', async () => {
    const output = await testInput(mode, 'component-handler-array', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
import { Button } from './button';
export default component$(() => {
  const count = useSignal(0);
  return <Button onClick$={[() => count.value++, () => console.log('clicked')]} />;
});
`,
    });
    expect(output.diagnostics).toEqual([]);
    const main = output.modules.find((module) => module.path === 'src/component.tsx')!.code;
    // Each handler is its own QRL; the child element resolves the list in order.
    expect(main).toMatch(/"onClick\$": \[q_\w+\.w\(\[count\]\), q_\w+\]/);
  });

  test('should render mutable QRL event bindings', async () => {
    const output = await testInput(mode, 'mutable-qrl-event', {
      code: `import { $, useSignal } from '@qwik.dev/core';
export default (props) => {
  const count = useSignal(0);
  let action = $(() => { count.value++; });
  if (props.disabled) action = null;
  return <button onClick$={action}>{count.value}</button>;
};
`,
    });
    expect(output.diagnostics).toEqual([]);
  });
});

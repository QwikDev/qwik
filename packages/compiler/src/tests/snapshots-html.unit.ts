/** Golden snapshots: elements, attributes, text and namespaces. */
import { describe, expect, test } from 'vitest';
import { testInput, testInputs } from './snapshot-runner';

describe.each(['ssr', 'csr'] as const)('%s', (mode) => {
  test('should let the runtime own the scoped class when a spread owns the attributes', async () => {
    const output = await testInput(mode, 'element-spread-scoped-class', {
      code: `import { component$, useStylesScoped$ } from '@qwik.dev/core';
export default component$(() => {
  useStylesScoped$(\`.from-static { color: red } .from-attr { color: blue }\`);
  const attr: Record<string, string> = { class: 'from-attr' };
  return (
    <>
      <div id="r1" class="from-static" {...attr}>a</div>
      <div id="r2" {...attr} class="from-static">b</div>
      <div id="r3" class="only-static">c</div>
    </>
  );
});
`,
    });
    expect(output.diagnostics).toEqual([]);
    const code = output.modules[0].code;
    // a spread makes the runtime props object the one writer of `class`; only the spread-free
    // element keeps a static scope class, so the scope must not print a second time on the others
    expect(code.match(/class=\\?"⚡️/g)).toHaveLength(1);
  });

  test('should compile a static default-arrow component', async () => {
    await testInput(mode, 'static-default-arrow', {
      code: `export default () => {
  return <p>Hello Qwik</p>;
};
`,
    });
  });

  test('should emit static attributes, bare booleans, JSX aliases, and aria', async () => {
    await testInput(mode, 'static-attributes', {
      code: `export default () => {
  return <main className="shell" htmlFor="x" hidden aria-hidden="false" title="A&B"></main>;
};
`,
    });
  });

  test('should render a text hole reading props', async () => {
    await testInput(mode, 'text-hole-props', {
      code: `export default (props: { title: string }) => {
  return <p>{props.title}</p>;
};
`,
    });
  });

  test('should render a text hole in an expression-body arrow', async () => {
    await testInput(mode, 'text-hole-expression-body', {
      code: `export default (props: { name: string }) => <p>{props.name}</p>;
`,
    });
  });

  test('should render a props text hole with sibling children', async () => {
    await testInput(mode, 'text-hole-siblings-props', {
      code: `export default (props: { title: string }) => {
  return <p>a{props.title}b</p>;
};
`,
    });
  });

  test('should render a signal-read text hole with sibling children', async () => {
    await testInput(mode, 'text-hole-siblings-signal', {
      code: `import { useSignal } from '@qwik.dev/core';
export default () => {
  const count = useSignal(0);
  return <p>Count: {count.value}!</p>;
};
`,
    });
  });
  test('should decompose a concat into static text and a stringify signal hole', async () => {
    await testInput(mode, 'text-hole-concat', {
      code: `import { useSignal } from '@qwik.dev/core';
export default () => {
  const count = useSignal(0);
  return <p>{'Count: ' + count.value}</p>;
};
`,
    });
  });

  test('should render multiple signal-read text holes with sibling children', async () => {
    await testInput(mode, 'text-hole-multi-siblings-signal', {
      code: `import { useSignal } from '@qwik.dev/core';
export default () => {
  const count = useSignal(0);
  const name = useSignal('Qwik');
  return <p>{name.value} count: {count.value}!</p>;
};
`,
    });
  });

  test('should expand object-literal element spreads into attributes', async () => {
    const output = await testInput(mode, 'element-literal-spread', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
export default component$(() => {
  const clicks = useSignal(0);
  const id = 'main';
  return (
    <div {...{ 'data-clicks': String(clicks.value), title: 'fixed', id }} class="box" onClick$={() => clicks.value++}>
      x
    </div>
  );
});
`,
    });
    expect(output.diagnostics).toEqual([]);
    const main = output.modules.find((module) => module.path === 'src/component.tsx')!.code;
    // A literal spread is ordinary attributes: no props effect, static parts stay flat.
    expect(main).not.toMatch(/createPropsEffect|renderSsrProps/);
    expect(main).toMatch(/title=\\?"fixed\\?"/);
    expect(main).toMatch(/class=\\?"box\\?"/);
    expect(main).toContain('"data-clicks"');
    expect(main).toContain('"id"');
  });

  test('should apply element spreads through one props effect', async () => {
    const output = await testInput(mode, 'element-spread-props', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
export default component$((props: { title: string }) => {
  const attrs = useSignal<Record<string, unknown>>({ class: 'last' });
  const box = useSignal<Element>();
  return (
    <div {...props} class="middle" {...attrs.value} ref={box} onClick$={() => (attrs.value = {})}>
      child
    </div>
  );
});
`,
    });
    expect(output.diagnostics).toEqual([]);
    const code = output.modules.map((module) => module.code).join('\n');
    const main = output.modules.find((module) => module.path === 'src/component.tsx')!.code;
    // The whole attribute list is one props object in authored order, so a later key wins.
    expect(code).toMatch(
      /\.\.\.props, "?class"?: "middle", \.\.\.attrs\.value, "?ref"?: box, "?onClick\$"?: q_/
    );
    if (mode === 'csr') {
      expect(main).toContain('createPropsEffect(el0, [attrs, box, props], ');
    } else {
      expect(main).toContain('renderSsrProps(id0, [attrs, box, props], ');
      expect(main).toContain('createSsrOpenTag(');
      expect(main).toContain('.attrs, ');
      expect(main).toContain('ctx.setRef(');
      expect(main).toContain('.innerHTML ?? ');
    }
  });

  test('should emit dangerouslySetInnerHTML as element content', async () => {
    const output = await testInput(mode, 'element-inner-html', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
export default component$(() => {
  const markup = useSignal('<i>live</i>');
  return (
    <section>
      <div dangerouslySetInnerHTML="<span>raw</span>" />
      <p dangerouslySetInnerHTML={markup.value} onClick$={() => (markup.value = '<b>next</b>')}>
        ignored
      </p>
    </section>
  );
});
`,
    });
    expect(output.diagnostics).toEqual([]);
    const main = output.modules.find((module) => module.path === 'src/component.tsx')!.code;
    // Static markup is element content, never an attribute and never escaped.
    expect(main).toContain('<div><span>raw</span></div>');
    expect(main).not.toMatch(/dangerouslySetInnerHTML=/i);
    expect(main).not.toContain('ignored');
    // A live value binds the innerHTML through the attribute helpers under its authored name.
    expect(main).toContain('"dangerouslySetInnerHTML", markup');
  });

  test('should serialize static and dynamic attributes alike', async () => {
    const output = await testInput(mode, 'attribute-parity', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
export default component$(() => {
  const on = useSignal(false);
  return (
    <section>
      <input required={false} aria-hidden={false} draggable={false} spellcheck={false} tabIndex={-1} data-n={2} hidden={true} />
      <input required={on.value} aria-hidden={on.value} draggable={on.value} spellcheck={on.value} tabIndex={-1} data-n={2} />
    </section>
  );
});
`,
    });
    expect(output.diagnostics).toEqual([]);
    const main = output.modules.find((module) => module.path === 'src/component.tsx')!.code;
    // Static literals fold to the bytes the runtime would serialize for the same values.
    expect(main).toMatch(
      /<input aria-hidden=\\?"false\\?" draggable=\\?"false\\?" spellcheck=\\?"false\\?" tabIndex=\\?"-1\\?" data-n=\\?"2\\?" hidden>/
    );
    expect(main).not.toMatch(/<input required/);
    // The dynamic twins bind under the same attribute names.
    for (const name of ['required', 'aria-hidden', 'draggable', 'spellcheck']) {
      expect(main).toContain(`"${name}", on`);
    }
  });

  test('should apply class and style combinations through the attribute helpers', async () => {
    const output = await testInput(mode, 'attribute-class-style', {
      code: `import { component$, useSignal, useStylesScoped$ } from '@qwik.dev/core';
export default component$(() => {
  useStylesScoped$('.base { color: red }');
  const active = useSignal(true);
  return (
    <button
      class={['base', { active: active.value, disabled: !active.value }]}
      style={{ opacity: active.value ? 1 : 0.5 }}
      onClick$={() => (active.value = !active.value)}
    />
  );
});
`,
    });
    expect(output.diagnostics).toEqual([]);
    const code = output.modules.map((module) => module.code).join('\n');
    // Arrays and objects serialize in the runtime helpers; the scoped style id rides along.
    expect(code).toMatch(/"class", \[active\], [^,]+, [^,]+, "⚡️/);
    expect(code).toContain('"style", [active]');
  });

  test('should bind refs to their elements', async () => {
    const output = await testInput(mode, 'element-refs', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
export default component$(() => {
  const input = useSignal<Element>();
  const show = useSignal(false);
  const calls: string[] = [];
  return (
    <section>
      <input ref={input} />
      <div ref={() => calls.push('ref')}>target</div>
      {show.value && <i ref={(el) => calls.push(el.tagName)}>late</i>}
    </section>
  );
});
`,
    });
    expect(output.diagnostics).toEqual([]);
    const code = output.modules.map((module) => module.code).join('\n');
    const main = output.modules.find((module) => module.path === 'src/component.tsx')!.code;
    // A ref is applied once when its element exists, never as an attribute or an effect.
    expect(main).not.toMatch(/ ref=|"ref": |'ref', /);
    if (mode === 'csr') {
      expect(main).toContain('setRef(input, el');
      expect(main).toMatch(/setRef\(\(\) => calls\.push\(['"]ref['"]\), el/);
      expect(code).toContain('setRef((el) => calls.push(el.tagName), el');
    } else {
      expect(main).toContain('ctx.setRef(input, id');
      expect(main).toMatch(/ctx\.setRef\(\(\) => calls\.push\(['"]ref['"]\), id/);
      expect(code).toContain('setRef((el) => calls.push(el.tagName), id');
    }
  });

  test('should keep static text markup-safe once, in both environments', async () => {
    const output = await testInput(mode, 'static-text-escaping', {
      code: `import { component$ } from '@qwik.dev/core';
export default component$(() => (
  <div>
    <p>a &lt; b &amp;&amp; c</p>
    <span>{'tick: ' + 1}</span>
    <textarea value="x < y" />
  </div>
));
`,
    });
    expect(output.diagnostics).toEqual([]);
    const main = output.modules.find((module) => module.path === 'src/component.tsx')!.code;
    // JSX text is authored HTML: entities pass through untouched, never escaped a second time.
    expect(main).toContain('<p>a &lt; b &amp;&amp; c</p>');
    expect(main).not.toContain('&amp;lt;');
    expect(main).toContain('<span>tick: 1</span>');
    // A literal attribute string is decoded text, so it is escaped as content.
    expect(main).toContain('<textarea>x &lt; y</textarea>');
  });

  test('should keep script and style content a literal written as-is', async () => {
    const output = await testInput(mode, 'raw-text-elements', {
      code: `import { component$ } from '@qwik.dev/core';
export default component$((props: { heading: string }) => (
  <div>
    <style>{'.a > b { color: red }'}</style>
    <script>{'if (a < b) { s = "</script>"; }'}</script>
    <title>{props.heading}</title>
  </div>
));
`,
    });
    expect(output.diagnostics).toEqual([]);
    const code = output.modules.map((module) => module.code).join('\n');
    // Raw text never decodes entities, so only a premature closer is guarded.
    expect(code).toContain('.a > b { color: red }');
    expect(code).toContain('if (a < b)');
    expect(code).toContain('<\\\\/script>');
    if (mode === 'ssr') {
      // A title decodes entities, so it keeps the usual escaping.
      expect(code.match(/escapeHTML\(text\d\)/g)).toHaveLength(1);
    }
  });

  test('should set a live value inside script and style as element content', async () => {
    const output = await testInput(mode, 'raw-text-live-value', {
      code: `export default (props: { init: string; rules: string }) => (
  <div>
    <script>{props.init}</script>
    <style>{'.a{'}{props.rules}{'}'}</style>
  </div>
);`,
    });
    expect(output.diagnostics).toEqual([]);
    const code = output.modules.map((module) => module.code).join('\n');
    // Raw text is never decoded, so it is set as content rather than escaped as text.
    expect(code).toContain('dangerouslySetInnerHTML');
    expect(code).not.toContain('escapeHTML');
  });

  test('should keep a live value inside title and textarea escaped text', async () => {
    const output = await testInput(mode, 'rcdata-live-value', {
      code: `export default (props: { heading: string; draft: string }) => (
  <div>
    <title>Page: {props.heading}</title>
    <textarea>{props.draft}</textarea>
  </div>
);`,
    });
    expect(output.diagnostics).toEqual([]);
    const code = output.modules.map((module) => module.code).join('\n');
    // A comment marker would read as text here, so the content is one text node.
    expect(code).not.toContain('dangerouslySetInnerHTML');
    expect(code).not.toContain('<!>');
    if (mode === 'ssr') {
      expect(code.match(/escapeHTML\(/g)).toHaveLength(2);
    }
  });

  test('should refuse content given both as children and as innerHTML', async () => {
    const output = await testInput(mode, 'raw-text-double-content', {
      code: `export default (props: { a: string; b: string }) => (
  <style dangerouslySetInnerHTML={props.a}>{props.b}</style>
);`,
    });
    expect(output.diagnostics).toMatchObject([{ code: 'raw-text-content' }]);
  });

  test('should keep a dynamic table section beside its static siblings', async () => {
    const output = await testInput(mode, 'table-dynamic-section', {
      code: `export default (props: { on: boolean; rows: number[] }) => (
  <table>
    <thead>
      <tr>
        <th>h</th>
      </tr>
    </thead>
    {props.on ? (
      <tbody>
        {props.rows.map((row) => (
          <tr key={row}>
            <td>{row}</td>
          </tr>
        ))}
      </tbody>
    ) : (
      <></>
    )}
    <tfoot>
      <tr>
        <td>f</td>
      </tr>
    </tfoot>
  </table>
);`,
    });
    expect(output.diagnostics).toEqual([]);
  });

  test('should build svg and math chunk templates in their namespace', async () => {
    const output = await testInput(mode, 'namespace-chunks', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
export default component$((props: { points: number[] }) => {
  const show = useSignal(false);
  return (
    <svg>
      {show.value && <circle r="1" />}
      {props.points.map((point) => <rect key={point} width={point} />)}
      <foreignObject>{show.value && <div>html</div>}</foreignObject>
      <foreignObject><math>{show.value && <mi>x</mi>}</math></foreignObject>
    </svg>
  );
});
`,
    });
    expect(output.diagnostics).toEqual([]);
    const code = output.modules.map((module) => module.code).join('\n');
    if (mode === 'csr') {
      // A chunk rooted inside svg or math parses inside a wrapper of that namespace.
      expect(code).toMatch(/_createElementTemplate\("<svg><circle r=\\"1\\"><\/circle><\/svg>"\)/);
      expect(code).toMatch(/_createElementTemplate\("<svg><rect><\/rect><\/svg>"\)/);
      expect(code).toMatch(/_createElementTemplate\("<math><mi>x<\/mi><\/math>"\)/);
      // foreignObject content is HTML again.
      expect(code).toMatch(/_createElementTemplate\("<div>html<\/div>"\)/);
    }
  });

  test('should infer the namespace of svg-only content outside an svg element', async () => {
    const output = await testInput(mode, 'namespace-inference', {
      code: `import { component$, useSignal, Slot } from '@qwik.dev/core';
export const Host = component$(() => <svg><Slot /></svg>);
export default component$(() => {
  const show = useSignal(false);
  return (
    <>
      <Host>
        {show.value && <path d="a" />}
        {show.value && <><circle r="1" /><mi>x</mi></>}
        {show.value && <title>t</title>}
      </Host>
      <svg>{show.value && <><rect /><circle /></>}</svg>
    </>
  );
});
`,
    });
    expect(output.diagnostics).toEqual([]);
    const code = output.modules.map((module) => module.code).join('\n');
    if (mode === 'csr') {
      // An svg-only root parses inside an svg wrapper wherever it is authored.
      expect(code).toMatch(/_createElementTemplate\("<svg><path d=\\"a\\"><\/path><\/svg>"\)/);
      // A fragment takes the namespace of its first element; a math tag after it follows suit.
      expect(code).toMatch(
        /createTemplate\("<svg><circle r=\\"1\\"><\/circle><mi>x<\/mi><\/svg>"\)/
      );
      expect(code).toMatch(/createTemplate\("<svg><rect><\/rect><circle><\/circle><\/svg>"\)/);
      // A name HTML also owns stays HTML.
      expect(code).toMatch(/_createElementTemplate\("<title>t<\/title>"\)/);
    }
  });

  test('should keep namespaced attribute names for the runtime', async () => {
    const output = await testInput(mode, 'namespaced-attributes', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
export default component$(() => {
  const icon = useSignal('#a');
  return (
    <svg xml:lang="en">
      <use xlink:href={icon.value} />
      <use xlink:href="#static" />
    </svg>
  );
});
`,
    });
    expect(output.diagnostics).toEqual([]);
    const main = output.modules.find((module) => module.path === 'src/component.tsx')!.code;
    // The qualified name reaches the attribute helpers, which pick the namespace from it.
    expect(main).toContain('"xlink:href", icon');
    expect(main).toMatch(/xml:lang=\\?"en\\?"/);
    expect(main).toMatch(/xlink:href=\\?"#static\\?"/);
  });

  test('should ignore empty event attributes', async () => {
    await testInput(mode, 'empty-event-attributes', {
      code: `import { useSignal } from '@qwik.dev/core';
export const Child = (props) => <button onClick$>{props.title}</button>;
export default () => {
  const attributes = useSignal({ title: 'save' });
  return <Child {...attributes.value} onSave$ />;
};
`,
    });
  });

  test('should keep a leading newline the parser would drop in pre and textarea', async () => {
    const output = await testInput(mode, 'leading-newline', {
      code: `export default (props: { code: string }) => (
  <div>
    <pre>{props.code}</pre>
    <pre>{'\\nfixed'}</pre>
    <textarea value={props.code} />
  </div>
);`,
    });
    expect(output.diagnostics).toEqual([]);
    const code = output.modules.map((module) => module.code).join('\n');
    // The static literal doubles at the analyser; a live value doubles when the server writes it.
    expect(code).toContain(String.raw`\n\nfixed`);
    if (mode === 'ssr') {
      expect(code.match(/\.replace\(\/\^\\n\/, '\\n\\n'\)/g)).toHaveLength(2);
    }
  });

  test('should fold several parts of text-only content into one hole', async () => {
    const output = await testInput(mode, 'text-only-content', {
      code: `export default (props: { page: string; line: string; count: number }) => (
  <div>
    <title>{props.page} - Site</title>
    <textarea>{props.line}{props.line}</textarea>
  </div>
);`,
    });
    expect(output.diagnostics).toEqual([]);
    const code = output.modules.map((module) => module.code).join('\n');
    // Comment markers would render as text inside RCDATA elements.
    expect(code).not.toContain('<!t>');
    expect(code).toContain('`${props.page} - Site`');
  });

  test('should render a bare signal child as its tracked value', async () => {
    const output = await testInput(mode, 'text-hole-signal-child', {
      code: `import { useSignal } from '@qwik.dev/core';
export default () => {
  const count = useSignal(1);
  return <span>{count}</span>;
};`,
    });
    const code = output.modules.map((module) => module.code).join('\n');
    expect(code).toContain(mode === 'ssr' ? 'renderSsrTextNode(' : 'createTextNodeEffect(');
    expect(code).not.toContain('createContentBlock');
    expect(code).not.toContain('renderSsrContent');
  });
});

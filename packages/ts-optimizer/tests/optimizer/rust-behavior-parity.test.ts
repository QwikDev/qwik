// Ports of the programmatic (non-snapshot) assertions from the Rust
// optimizer's test.rs. The snapshot corpus is covered by convergence.test.ts;
// these keep the behavior checks that snapshots alone don't express.
import { describe, it, expect } from 'vitest';
import { transformModule } from '../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../src/optimizer/types/brands.js';
import type {
  EmitMode,
  EntryStrategy,
  TransformModulesOptions,
  TransformOutput,
} from '../../src/optimizer/types/types.js';

/** Mirrors Rust's `TestInput::default()`. */
function rustDefaults(
  code: string,
  overrides: Partial<Omit<TransformModulesOptions, 'input' | 'srcDir'>> & {
    filename?: string;
    srcDir?: string;
  } = {}
): TransformModulesOptions {
  const { filename, srcDir, ...rest } = overrides;
  return {
    input: [{ path: mkFilePath(filename ?? 'test.tsx'), code: mkSourceText(code) }],
    srcDir: mkFilePath(srcDir ?? '/user/qwik/src/'),
    entryStrategy: { type: 'segment' },
    minify: 'simplify',
    mode: 'test',
    ...rest,
  };
}

const segments = (output: TransformOutput) => output.modules.filter((m) => m.kind === 'segment');

const parents = (output: TransformOutput) => output.modules.filter((m) => m.kind === 'parent');

const combinedCode = (output: TransformOutput) => output.modules.map((m) => m.code).join('\n');

const compact = (code: string) => code.replace(/\s+/g, '');

/** Rust's `get_hash`: the trailing `_`-separated part of a symbol name. */
const getHash = (name: string) => name.split('_').at(-1)!;

/** Rust's `get_segment_hash_by_ctx_name` (asserts exactly one match). */
function segmentHashByCtxName(output: TransformOutput, ctxName: string): string {
  const matches = segments(output).filter((m) => m.segment.ctxName === ctxName);
  expect(matches, `expected exactly one segment for ${ctxName}`).toHaveLength(1);
  return getHash(matches[0].segment.name);
}

function segmentNameByCtxName(output: TransformOutput, ctxName: string): string {
  const matches = segments(output).filter((m) => m.segment.ctxName === ctxName);
  expect(matches, `expected exactly one segment for ${ctxName}`).toHaveLength(1);
  return matches[0].segment.name;
}

describe('stripped-segment import reporting', () => {
  const stripOptions = {
    entryStrategy: { type: 'hoist' } as EntryStrategy,
    stripCtxName: ['useVisibleTask'],
    stripEventHandlers: true,
    transpileTs: true,
    transpileJsx: true,
    isServer: true,
  };

  it('reports imports used only in stripped segments', () => {
    const output = transformModule(
      rustDefaults(
        `
import { component$, useVisibleTask$ } from '@qwik.dev/core';
import { ping } from '~/shared/visible-task-server-fn';

export const App = component$(() => {
	useVisibleTask$(async () => {
		await ping();
	});
	return <div>hi</div>;
});
`,
        stripOptions
      )
    );

    const rootModule = parents(output)[0];
    expect(rootModule, 'root module should exist').toBeDefined();
    expect(rootModule.imports, 'root module should report imports used before stripping').toContain(
      '~/shared/visible-task-server-fn'
    );
  });

  it('reports dynamic imports used only in stripped segments', () => {
    const output = transformModule(
      rustDefaults(
        `
import { component$, useVisibleTask$ } from '@qwik.dev/core';

export const App = component$(() => {
	useVisibleTask$(async () => {
		const { ping } = await import('~/shared/visible-task-server-fn');
		await ping();
	});
	return <div>hi</div>;
});
`,
        stripOptions
      )
    );

    const rootModule = parents(output)[0];
    expect(rootModule, 'root module should exist').toBeDefined();
    expect(
      rootModule.imports,
      'root module should report dynamic imports used before stripping'
    ).toContain('~/shared/visible-task-server-fn');
  });
});

describe('path handling', () => {
  it('supports windows paths', () => {
    const output = transformModule(
      rustDefaults(
        `
import { component$ } from '@qwik.dev/core';
export const Greeter = component$(() => <div/>)
`,
        {
          filename: 'components\\apps\\apps.tsx',
          srcDir: 'C:\\users\\apps',
          transpileJsx: true,
          isServer: false,
        }
      )
    );
    for (const module of output.modules) {
      expect(module.path).not.toContain('\\');
    }
  });
});

describe('consistent hashes across modes and strategies', () => {
  const code = `
import { component$, $ } from '@qwik.dev/core';
import mongo from 'mongodb';

export const Greeter = component$(() => {
	// Double count watch
	useTask$(async () => {
		await mongo.users();
	});
	return (
		<div>
			<div onClick$={() => {}}/>
			<div onClick$={() => {}}/>
			<div onClick$={() => {}}/>
		</div>
	)
});
`;

  const runBoth = (mode: EmitMode, strategy: EntryStrategy, transpile: boolean) =>
    transformModule({
      input: [
        { path: mkFilePath('main.tsx'), code: mkSourceText(code) },
        { path: mkFilePath('components/main.tsx'), code: mkSourceText(code) },
      ],
      srcDir: mkFilePath('./thing'),
      minify: 'simplify',
      explicitExtensions: true,
      mode,
      entryStrategy: strategy,
      transpileTs: transpile,
      transpileJsx: transpile,
    });

  it('segment hashes are identical for every mode/strategy/transpile combination', () => {
    const refSegments = segments(runBoth('test', { type: 'segment' }, true));

    const options: Array<[EmitMode, EntryStrategy['type'], boolean]> = [];
    for (const transpile of [true, false]) {
      for (const mode of ['test', 'prod', 'dev'] as const) {
        for (const strategy of ['segment', 'single', 'component'] as const) {
          options.push([mode, strategy, transpile]);
        }
      }
    }

    for (const [mode, strategyType, transpile] of options) {
      const segs = segments(runBoth(mode, { type: strategyType }, transpile));
      expect(segs.length, `${mode}/${strategyType}/${transpile}`).toBe(refSegments.length);
      for (let i = 0; i < segs.length; i++) {
        expect(
          getHash(segs[i].segment.name),
          `${mode}/${strategyType}/${transpile} segment ${i}`
        ).toBe(getHash(refSegments[i].segment.name));
      }
    }
  });
});

describe('props destructuring refusal', () => {
  const cases: Array<[string, string, string]> = [
    [
      'template_literal',
      'ogImage',
      `
			export const buildHead = ({ ogImage }: { ogImage?: string }) => {
				if (!ogImage) { ogImage = \`fallback-image-url\`; }
				return { meta: [{ property: "og:image", content: ogImage }] };
			};
			`,
    ],
    [
      'string_literal',
      'ogImage',
      `
			export const buildHead = ({ ogImage }: { ogImage?: string }) => {
				if (!ogImage) { ogImage = "fallback-image-url"; }
				return { meta: [{ property: "og:image", content: ogImage }] };
			};
			`,
    ],
    [
      'nullish_assign',
      'ogImage',
      `
			export const buildHead = ({ ogImage }: { ogImage?: string }) => {
				ogImage ??= \`fallback-image-url\`;
				return { ogImage };
			};
			`,
    ],
    [
      'update_expr',
      'count',
      `
			export const bump = ({ count }: { count: number }) => {
				count++;
				return { count };
			};
			`,
    ],
    [
      'object_destructure_assign',
      'ogImage',
      `
			export const buildHead = ({ ogImage }: { ogImage?: string }) => {
				({ ogImage } = { ogImage: "fallback-image-url" });
				return { meta: [{ property: "og:image", content: ogImage }] };
			};
			`,
    ],
    [
      'array_destructure_assign',
      'count',
      `
			export const bump = ({ count }: { count: number }) => {
				[count] = [42];
				return { count };
			};
			`,
    ],
    [
      'for_of',
      'ogImage',
      `
			export const buildHead = ({ ogImage }: { ogImage?: string }) => {
				for (ogImage of ["fallback-image-url"]) {}
				return { meta: [{ property: "og:image", content: ogImage }] };
			};
			`,
    ],
    [
      'for_in',
      'ogImage',
      `
			export const buildHead = ({ ogImage }: { ogImage?: string }) => {
				for (ogImage in { "fallback-image-url": 1 }) {}
				return { meta: [{ property: "og:image", content: ogImage }] };
			};
			`,
    ],
    [
      'for_of_destructure',
      'ogImage',
      `
			export const buildHead = ({ ogImage }: { ogImage?: string }) => {
				for ({ ogImage } of [{ ogImage: "fallback-image-url" }]) {}
				return { meta: [{ property: "og:image", content: ogImage }] };
			};
			`,
    ],
  ];

  it.each(cases)(
    'refuses the rewrite when the binding is reassigned (%s)',
    (label, binding, code) => {
      const output = transformModule(rustDefaults(code, { transpileTs: true, transpileJsx: true }));
      const emitted = output.modules[0].code;
      expect(
        emitted,
        `[${label}] props-destructuring rewrite must be refused on reassignment`
      ).not.toContain('_rawProps');
      expect(emitted, `[${label}] destructured binding must be preserved`).toContain(binding);
    }
  );

  it('does not refuse for a for-of loop declarator in an inline component', () => {
    const output = transformModule(
      rustDefaults(
        `
		import { component$ } from "@qwik.dev/core";
		export const Cmp = component$(({ items }: { items: string[] }) => {
			const out = [];
			for (const it of items) { out.push(it); }
			return <div>{out.join(",")}</div>;
		});
		`,
        { transpileTs: true, transpileJsx: true }
      )
    );
    const entry = output.modules.find((m) => m.isEntry);
    expect(entry, 'expected an entry-point module for the component body').toBeDefined();
    expect(entry!.code).toContain('_rawProps.items');
  });
});

describe('variable migration', () => {
  it('keeps transitive deps available to other segments', () => {
    const output = transformModule(
      rustDefaults(`
import { component$, $ } from '@qwik.dev/core';

// scrollState is used by both segments - must NOT be migrated
const scrollState = (el) => ({ x: el.scrollLeft, y: el.scrollTop });

// saveScroll is used by both segments - must NOT be migrated
const saveScroll = (s) => history.replaceState(s, '');

// bigHelper depends on scrollState and saveScroll, used only by App
const bigHelper = (el) => {
  const s = scrollState(el);
  saveScroll(s);
  return s;
};

export const App = component$(() => {
  // Uses bigHelper (which transitively uses scrollState and saveScroll)
  const s = bigHelper(document.body);
  return <div>{s.x}</div>;
});

export const Other = component$(() => {
  // Directly uses scrollState and saveScroll
  const s = scrollState(document.body);
  saveScroll(s);
  return <div>{s.y}</div>;
});
`)
    );

    const otherSegment = output.modules.find((m) => m.path.includes('Other_component'));
    expect(otherSegment, 'Other_component segment should exist').toBeDefined();
    for (const name of ['scrollState', 'saveScroll']) {
      expect(
        otherSegment!.code.includes(name) &&
          (otherSegment!.code.includes('import') || otherSegment!.code.includes(`const ${name}`)),
        `${name} must be available in Other segment (imported or inlined), got:\n${otherSegment!.code}`
      ).toBe(true);
    }
  });
});

describe('transform robustness', () => {
  it('import collision with renaming succeeds and produces an entry module', () => {
    const output = transformModule(
      rustDefaults(`
import { component$ } from '@qwik.dev/core';

export const Test = component$(() => {
	return <div>Test</div>;
});
`)
    );
    expect(output.modules.length).toBeGreaterThan(0);
    expect(output.modules.some((m) => m.isEntry)).toBe(true);
  });

  it('dev mode transform emits code for every module', () => {
    const output = transformModule(
      rustDefaults(
        `
import { component$ } from '@qwik.dev/core';

export const Test = component$(() => {
	const items = [1, 2, 3];
	return (
		<div>
			{items.map(item => <div>{item}</div>)}
		</div>
	);
});
`,
        { mode: 'dev' }
      )
    );
    for (const module of output.modules) {
      expect(module.code, `module ${module.path} should have code`).not.toBe('');
    }
  });

  it('loop iteration variables with event handlers transform successfully', () => {
    const output = transformModule(
      rustDefaults(`
import { component$ } from '@qwik.dev/core';

export const Test = component$(() => {
	return (
		<div>
			{['a', 'b', 'c'].map((item, index) => (
				<button onClick$={() => console.log(item, index)}>
					{item}
				</button>
			))}
		</div>
	);
});
`)
    );
    expect(output.modules.length).toBeGreaterThan(0);
    expect(output.modules.some((m) => m.isEntry)).toBe(true);
  });

  it('resolves imports without symbol-only fallbacks', () => {
    const output = transformModule(
      rustDefaults(`
import { signal, component$ } from '@qwik.dev/core';

export const Test = component$(() => {
	const sig = signal(0);
	return <div>{sig}</div>;
});
`)
    );
    for (const module of output.modules) {
      expect(module.code, `module ${module.path} should have code`).not.toBe('');
    }
  });
});

describe('import-backed QRL naming and hashing', () => {
  const bareDollarBody = (importLine: string, expr = 'name') => `
import { $ } from '@qwik.dev/core';
${importLine}

export const value = $(${expr});
`;

  it('hash matches across different relative import spellings and files', () => {
    const first = transformModule(
      rustDefaults(bareDollarBody(`import { name } from './utils/value';`), {
        filename: 'src/routes/a.tsx',
      })
    );
    const second = transformModule(
      rustDefaults(bareDollarBody(`import { name } from '../shared/../utils/value';`), {
        filename: 'src/routes/nested/b.tsx',
      })
    );
    expect(segmentHashByCtxName(first, '$')).toBe(segmentHashByCtxName(second, '$'));
  });

  it('hash matches between named and namespace member imports', () => {
    const named = transformModule(
      rustDefaults(bareDollarBody(`import { name } from './utils/value';`), {
        filename: 'src/routes/a.tsx',
      })
    );
    const namespace = transformModule(
      rustDefaults(bareDollarBody(`import * as ns from './utils/value';`, 'ns.name'), {
        filename: 'src/routes/a.tsx',
      })
    );
    expect(segmentHashByCtxName(named, '$')).toBe(segmentHashByCtxName(namespace, '$'));
  });

  it('normalizes backslashes; package imports hash differently', () => {
    const relative = transformModule(
      rustDefaults(bareDollarBody(`import { name } from '.\\\\utils\\\\value';`), {
        filename: 'src/routes/a.tsx',
      })
    );
    const relativeNormalized = transformModule(
      rustDefaults(bareDollarBody(`import { name } from './utils/value';`), {
        filename: 'src/routes/a.tsx',
      })
    );
    const packageImport = transformModule(
      rustDefaults(bareDollarBody(`import { name } from '@pkg/utils/value';`), {
        filename: 'src/routes/a.tsx',
      })
    );
    expect(segmentHashByCtxName(relative, '$')).toBe(segmentHashByCtxName(relativeNormalized, '$'));
    expect(segmentHashByCtxName(relativeNormalized, '$')).not.toBe(
      segmentHashByCtxName(packageImport, '$')
    );
  });

  it('default imports use an import-based name prefix', () => {
    const output = transformModule(
      rustDefaults(
        `
import { $ } from '@qwik.dev/core';
import css from './style.css';

export const value = $(css);
`,
        { filename: 'src/routes/a.tsx' }
      )
    );
    expect(segmentNameByCtxName(output, '$')).toMatch(/^style_css_/);
  });

  it('falls back to position-based hashing for unsupported reference shapes', () => {
    const base = transformModule(
      rustDefaults(bareDollarBody(`import * as ns from './utils/value';`, 'ns.name'), {
        filename: 'src/routes/a.tsx',
      })
    );
    const nestedMember = transformModule(
      rustDefaults(bareDollarBody(`import * as ns from './utils/value';`, 'ns.name.deep'), {
        filename: 'src/routes/a.tsx',
      })
    );
    const computedMember = transformModule(
      rustDefaults(
        `
import { $ } from '@qwik.dev/core';
import * as ns from './utils/value';

const key = 'name';
export const value = $(ns[key]);
`,
        { filename: 'src/routes/a.tsx' }
      )
    );
    const tooManyDotdots = transformModule(
      rustDefaults(bareDollarBody(`import { name } from '../../../value';`), {
        filename: 'src/routes/a.tsx',
      })
    );
    const tooManyDotdotsOtherFile = transformModule(
      rustDefaults(bareDollarBody(`import { name } from '../../../value';`), {
        filename: 'src/routes/b.tsx',
      })
    );

    expect(segmentHashByCtxName(base, '$')).not.toBe(segmentHashByCtxName(nestedMember, '$'));
    expect(segmentHashByCtxName(base, '$')).not.toBe(segmentHashByCtxName(computedMember, '$'));
    expect(segmentHashByCtxName(tooManyDotdots, '$')).not.toBe(
      segmentHashByCtxName(tooManyDotdotsOtherFile, '$')
    );
  });
});

describe('hoist strategy inlinedQrl emission', () => {
  it('uses an identifier reference when hoisted', () => {
    const output = transformModule(
      rustDefaults(
        `
import { component$ } from '@qwik.dev/core';

export const App = component$(() => {
	return <div>Hello</div>;
});
`,
        { entryStrategy: { type: 'hoist' }, transpileTs: true, transpileJsx: true }
      )
    );
    const code = compact(combinedCode(output));
    expect(code).toContain('_noopQrl("App_component_');
    expect(code.includes('.s(App_component_') || code.includes('.s(TestComponent_component_')).toBe(
      true
    );
  });

  it('emits forward refs after their referenced identifiers', () => {
    const output = transformModule(
      rustDefaults(
        `
import { component$ } from '@qwik.dev/core';
import { useAsyncQrl } from '@qwik.dev/core';

export const TestComponent = component$(() => {
	// This should be hoisted with an identifier
	const asyncSig = useAsyncQrl$(async () => {
		return 42;
	});
	return <div>{asyncSig}</div>;
});
`,
        { entryStrategy: { type: 'hoist' }, transpileTs: true, transpileJsx: true }
      )
    );
    const code = compact(combinedCode(output));
    expect(code).toContain('_noopQrl("TestComponent_component_');
    expect(code.includes('.s(App_component_') || code.includes('.s(TestComponent_component_')).toBe(
      true
    );
  });
});

describe('lib mode and pre-compiled library inputs', () => {
  it('lib mode inlines expressions without _captures', () => {
    const output = transformModule(
      rustDefaults(
        `
import { component$ } from '@qwik.dev/core';

export const App = component$(() => {
	return <div>Hello</div>;
});
`,
        {
          mode: 'lib',
          entryStrategy: { type: 'hoist' },
          transpileTs: true,
          transpileJsx: true,
        }
      )
    );
    const code = compact(combinedCode(output));
    expect(code).toContain('inlinedQrl((');
    expect(code).not.toContain('_captures');
  });

  it('preserves all five inner inlinedQrl captures', () => {
    const output = transformModule(
      rustDefaults(
        `
import { componentQrl, inlinedQrl, useTaskQrl, useSignal, _captures } from '@qwik.dev/core';

export function qwikifyQrl(reactCmp$, opts) {
	return componentQrl(inlinedQrl((props) => {
		const opts2 = _captures[0], reactCmp$2 = _captures[1];
		const hostRef = useSignal();
		const signal = useSignal();
		const text = 'hello';
		useTaskQrl(inlinedQrl(async ({ track }) => {
			const hostRef2 = _captures[0], reactCmp$3 = _captures[1], opts3 = _captures[2], signal2 = _captures[3], text2 = _captures[4];
			track(signal2);
			console.log(hostRef2, reactCmp$3, opts3, text2);
		}, "s_inner123", [hostRef, reactCmp$2, opts2, signal, text]));
	}, "s_outer456", [opts, reactCmp$]));
}
`,
        { entryStrategy: { type: 'hoist' }, mode: 'prod', isServer: true }
      )
    );
    const code = combinedCode(output);

    const search = code.indexOf('q_s_inner123.w(');
    const start = search >= 0 ? search : code.indexOf('"s_inner123"');
    expect(start, `should find s_inner123 call in output:\n${code}`).toBeGreaterThanOrEqual(0);

    const bracketStart = code.indexOf('[', start);
    const bracketEnd = code.indexOf(']', bracketStart);
    const capturesStr = code.slice(bracketStart + 1, bracketEnd);
    const captureCount = capturesStr.trim() === '' ? 0 : capturesStr.split(',').length;

    expect(captureCount, `captures: '${capturesStr}'`).toBe(5);
    for (const name of ['hostRef', 'reactCmp$2', 'opts2', 'signal', 'text']) {
      expect(capturesStr, `capture '${name}' should be present`).toContain(name);
    }
  });

  it('preserves destructured bindings referenced by explicit captures', () => {
    const output = transformModule(
      rustDefaults(
        `
import { componentQrl, inlinedQrl, useComputedQrl, useSignal, useTaskQrl, _captures, _jsxSorted } from '@qwik.dev/core';
import { useCustomSignal } from './use-custom-signal.qwik.mjs';

const MyComponent = componentQrl(inlinedQrl((props) => {
    const count = useSignal(0);
    const { openSig: isOpen } = useCustomSignal(props, { open: false });
    const label = useComputedQrl(inlinedQrl(() => {
        const count2 = _captures[0], isOpen2 = _captures[1];
        return count2.value + isOpen2.value;
    }, "MyComponent_component_label_useComputed_ABC123", [count, isOpen]));
    useTaskQrl(inlinedQrl(({ track }) => {
        const isOpen3 = _captures[0];
        track(() => isOpen3.value);
        console.log("isOpen changed:", isOpen3.value);
    }, "MyComponent_component_useTask_DEF456", [isOpen]));
    return _jsxSorted("div", null, {}, label.value, 0, null);
}, "MyComponent_component_MNO345"));

export { MyComponent };
`,
        { entryStrategy: { type: 'hoist' }, minify: 'none', mode: 'dev', isServer: true }
      )
    );
    const code = combinedCode(output);

    expect(code, 'destructured binding must not be collapsed').toContain('isOpen');

    const computedStart = code.indexOf('q_MyComponent_component_label_useComputed_ABC123.w(');
    expect(computedStart, `should find computed QRL .w() call:\n${code}`).toBeGreaterThanOrEqual(0);
    const after = code.slice(computedStart);
    const capturesStr = after.slice(0, after.indexOf('])') + 1);
    expect(capturesStr).toContain('count');
    expect(capturesStr).toContain('isOpen');

    expect(code).toContain('q_MyComponent_component_useTask_DEF456.w(');
  });

  it('shortens lib full names to s_hash in prod', () => {
    const output = transformModule(
      rustDefaults(
        `
import { componentQrl, inlinedQrl, useTaskQrl, _captures } from '@qwik.dev/core';

export const Works = componentQrl(inlinedQrl((props) => {
	const text = 'hola';
	useTaskQrl(inlinedQrl(() => {
		const text = _captures[0];
		console.log(text);
	}, "Works_component_useTask_pjo5U5Ikll0", [text]));
}, "Works_component_t45qL4vNGv0"));
`,
        { entryStrategy: { type: 'hoist' }, mode: 'prod' }
      )
    );
    const code = combinedCode(output);
    expect(code).toContain('s_pjo5U5Ikll0');
    expect(code).toContain('s_t45qL4vNGv0');
    expect(code).not.toContain('Works_component');
  });

  it('preserves non-identifier explicit captures', () => {
    const output = transformModule(
      rustDefaults(
        `
import { _captures, inlinedQrl } from '@qwik.dev/core';

const left = 1;
const right = 2;

export const task = inlinedQrl(() => {
	const left = _captures[0];
	const middle = _captures[1];
	const right = _captures[2];
	return middle ? left : right;
}, 'task', [left, true, right]);
`,
        { mode: 'dev' }
      )
    );
    const entryModule = output.modules.find((m) => m.kind === 'parent');
    expect(entryModule, 'entry module not found').toBeDefined();
    expect(compact(entryModule!.code)).toContain('.w([left,true,right])');
  });
});

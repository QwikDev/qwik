import { describe, expect, it } from 'vitest';
import { parseQwikCode } from './parse';

const sampleVarDecl = `
  import { 
  component$, 
  useStore,
  useSignal, 
  useTask$, 
  useComputed$, 
  $,
  useContext,
  useContextProvider,
  useId,
  useOnDocument,
  useOnWindow,
  useResource$,
  useStyles$,
  useStylesScoped$,
  createContextId,
  Resource,
  useAsyncComputed$,
  useSerializer$,
  useConstant,
  useOn,
  useServerData,
  useErrorBoundary
} from '@qwik.dev/core';
import { _getDomContainer, isServer, useVisibleTask$ } from '@qwik.dev/core/internal';
import type { QRL, Signal } from '@qwik.dev/core';
import { useLocation, useNavigate, Link, useContent, useDocumentHead } from '@qwik.dev/router';
import { useDebouncer } from './debounce';
import { useHooks } from './collectHooks';
const ButtonContext = createContextId<{ theme: string; size: string }>('button-context');

interface ButtonProps {
  class?: string;
  onClick$?: QRL<() => void>;
  testValue: Signal<string>;
}

export default component$<ButtonProps>((props) => {
  const { class: className = '', onClick$ } = props;
  const testValue2 = props.testValue
  console.log('testValue', testValue2)
  const store = useStore({
    count: 0,
    dd:12,
    cc: 33,
    aa: [1,2,3  ]
  });
  const signal = useSignal<any>('111');
  const constantValue = useConstant(() => 'CONST');
  const serverData = useServerData<any>('demo-key');
  const errorBoundary = useErrorBoundary();
  const location = useLocation();
  const navigate = useNavigate();
  const content = useContent();
  const head = useDocumentHead();

  

  useTask$(({ track }) => {
    track(() => store.count);
    signal.value = '33333'
  })

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track }) => {
    track(() => store.count);
    signal.value = '2227'
  })

  const qwikContainer = useComputed$(() => {
    try {
      if(isServer){
        return null
      }
      const htmlElement = document.documentElement;
      return _getDomContainer(htmlElement);
    } catch (error) {
      console.error(error);
      return null;
    }
  });

  const asyncComputedValue =  useAsyncComputed$(({ track }) =>
    Promise.resolve(track(signal) + 3),
  );
                                                                                                                                      
  useContextProvider(ButtonContext, {
    theme: 'primary',
    size: 'large'
  });
  useHooks('Button')
  const context = useContext(ButtonContext);

  const buttonId = useId();

  useOnDocument('keydown', $(() => {
    console.log('Document keydown event');
  }));
  const dd = useHooks('Button1')
  useOnWindow('resize', $(() => {
    console.log('Window resized');
  }));

  useOn('click', $(() => {
    console.log('Host clicked');
  }));

  const resourceData = useResource$(async ({ track }) => {
    track(() => store.count);
    await new Promise(resolve => setTimeout(resolve, 200));
    return {
      message: \`Resource data for count: \${store.count}\`,
      timestamp: Date.now()
    };
  });

  const customSerialized = useSerializer$(() => ({
    deserialize: () => ({ n: store.count }),
    update: (current: { n: number }) => {
      current.n = store.count;
      return current;
    }
  }));

  useStyles$(\`
    .custom-button {
      background: linear-gradient(45deg, #ff6b6b, #4ecdc4);
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 5px;
      cursor: pointer;
      transition: transform 0.2s;
    }
    .custom-button:hover {
      transform: scale(1.05);
    }
  \`);

  useStylesScoped$(\`
    .scoped-button {
      background: linear-gradient(45deg, #667eea, #764ba2);
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 3px;
      cursor: pointer;
    }
  \`);
  const debounce = useDebouncer(
    $((value: string) => {
      signal.value = value;
    }),
    1000
  );
 

  const handleClick = $(async () => {
    store.count++;
    console.log('Button clicked! Count:', store.count);
    debounce(store.count)
    if (onClick$) {
      await onClick$();
    }
  });

  const handleGoAbout = $(() => navigate('/about'));

  return (
    <div>
      <button 
        id={buttonId}
        class={\`\${className} custom-button scoped-button\`}
        onClick$={handleClick}
      >
        Click me {store.count}{signal.value}{qwikContainer.value?.qManifestHash}
      </button>
      <button 
        class={\`custom-button scoped-button\`}
        style="margin-left: 8px"
        onClick$={handleGoAbout}
      >
        Go /about
      </button>
      <Link href="/blog" class={\`scoped-button\`} style="margin-left: 8px; padding: 8px 16px; display: inline-block; text-decoration: none;">
        Go /blog
      </Link>
      
      <div style="margin-top: 10px; font-size: 12px; color: #666;">
        <div>Current Path: {location.url.pathname}</div>
        <div>Is Navigating: {location.isNavigating ? 'true' : 'false'}</div>
        <div>Params: {JSON.stringify(location.params)}</div>
        <div>Prev URL: {location.prevUrl ? location.prevUrl.pathname : '—'}</div>
        <div>Head Title: {head.title}</div>
        <div>Head Metas: {head.meta.length}</div>
        <div>Content Menu: {content.menu ? 'yes' : 'no'}</div>
        <div>Content Headings: {content.headings ? content.headings.length : 0}</div>
        <div>Async Computed: {asyncComputedValue.value}</div>
        <div>Context: {context.theme} - {context.size}</div>
        <div>Button ID: {buttonId}</div>
        <div>Constant: {constantValue}</div>
        {errorBoundary.error && <div>Error captured</div>}
        <div>ServerData: {serverData ? JSON.stringify(serverData) : 'N/A'}</div>
        <div>Serialized N: {customSerialized.value.n}</div>
        <Resource
          value={resourceData}
          onPending={() => <div>Loading resource...</div>}
          onResolved={(data) => <div>Resource: {data.message}</div>}
          onRejected={(error) => <div>Error: {error.message}</div>}
        />
        <div>Count: {store.count}, Signal: {signal.value}</div>
      </div>
    </div>
  );
});

`;

describe('injectCollectHooks', () => {
  it('injects initialization into component$ (import handled by plugin layer)', () => {
    const input = sampleVarDecl;
    const output = parseQwikCode(input, { path: '/abs/path/Button.tsx?id=abc' });
    expect(output).toContain('const collecthook = useCollectHooks("/abs/path/Button.tsx_Button")');
  });

  it('does not inject virtual import here (plugin layer does it)', () => {
    const input = sampleVarDecl;
    const output = parseQwikCode(input, { path: 'new URL(import.meta.url).pathname' });
    expect(output.includes("import { useCollectHooks } from 'virtual-qwik-devtools.ts'")).toBe(
      false
    );
  });

  it('inserts initialization at the very beginning of component$ body with proper indent', () => {
    const input = sampleVarDecl;
    const output = parseQwikCode(input, { path: '/abs/path/Button.tsx?id=abc' });
    const initLine = 'const collecthook = useCollectHooks("/abs/path/Button.tsx_Button")';
    const firstBodyStmt = "const { class: className = '', onClick$ } = props;";
    const initIdx = output.indexOf(initLine);
    const firstStmtIdx = output.indexOf(firstBodyStmt);
    expect(initIdx).toBeGreaterThan(-1);
    expect(firstStmtIdx).toBeGreaterThan(-1);
    expect(initIdx).toBeLessThan(firstStmtIdx);
    const initLineWithIndent = '\n  ' + initLine;
    expect(output).toContain(initLineWithIndent);
  });

  it('is idempotent: running twice does not duplicate init', () => {
    const input = sampleVarDecl;
    const once = parseQwikCode(input, { path: 'CUSTOM_PATH' });
    const twice = parseQwikCode(once, { path: 'CUSTOM_PATH' });
    const count = (s: string, sub: string) =>
      (s.match(new RegExp(sub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    // import injection is handled by plugin layer now
    expect(count(twice, 'virtual-qwik-devtools')).toBe(0);
    expect(count(twice, 'const collecthook = useCollectHooks')).toBe(1);
  });

  it('contains expected hookType and data fields in transformed output', () => {
    const input = sampleVarDecl;
    const output = parseQwikCode(input, { path: '/abs/path/Button.tsx?id=abc' });
    expect(output).toContain("hookType: 'useStore'");
    expect(output).toContain("hookType: 'useSignal'");
    expect(output).toContain("hookType: 'useTask'");
    expect(output).toContain("hookType: 'useVisibleTask'");
    expect(output).toContain("hookType: 'customhook'");
    expect(output).toContain('data: signal');
  });

  it('matches snapshot of transformed output', () => {
    const input = sampleVarDecl;
    const output = parseQwikCode(input, { path: '/abs/path/Button.tsx?id=abc' });
    expect(output).toMatchSnapshot();
  });

  it('supports custom collecthook arg via options', () => {
    const input = sampleVarDecl;
    const output = parseQwikCode(input, { path: 'CUSTOM_PATH' });
    expect(output).toContain('const collecthook = useCollectHooks("CUSTOM_PATH_CUSTOM_PATH")');
  });

  it('supports passing Vite transform id via options.collectArgValue', () => {
    const input = sampleVarDecl;
    const output = parseQwikCode(input, { path: '/abs/path/Button.tsx?id=abc' });
    expect(output).toContain('const collecthook = useCollectHooks("/abs/path/Button.tsx_Button")');
  });

  it('injects for custom expression (e.g. useHooks without assignment) and uses temp var', () => {
    const input = sampleVarDecl;
    const output = parseQwikCode(input, { path: 'CUSTOM_PATH' });
    // 生成临时变量 _customhook_0
    expect(output).toMatch(/\n\s*let\s+_customhook_0\s*=\s*useHooks\('Button'\)\s*;/);
    // 随后紧跟 payload，其中 variableName 为 _customhook_0，hookType 为 customhook
    const re =
      /collecthook\(\s*\{[\s\S]*?variableName:\s*'_customhook_0'[\s\S]*?hookType:\s*'customhook'[\s\S]*?category:\s*'VariableDeclarator'[\s\S]*?data:\s*_customhook_0[\s\S]*?\}\);/m;
    expect(re.test(output)).toBe(true);
  });

  it('is idempotent for custom expression replacement (no duplicate _customhook)', () => {
    const input = sampleVarDecl;
    const once = parseQwikCode(input, { path: 'CUSTOM_PATH' });
    const twice = parseQwikCode(once, { path: 'CUSTOM_PATH' });
    const count = (s: string, sub: string) =>
      (s.match(new RegExp(sub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    expect(count(twice, 'let _customhook_')).toBe(1);
    expect(count(twice, "variableName: '_customhook_0'")).toBe(1);
  });

  it('generates parent dir suffix for index.tsx (plain path)', () => {
    const input = sampleVarDecl;
    const output = parseQwikCode(input, { path: '/abs/path/router/index.tsx' });
    expect(output).toContain(
      'const collecthook = useCollectHooks("/abs/path/router/index.tsx_router")'
    );
  });

  it('strips query/hash and uses parent dir for index.tsx', () => {
    const input = sampleVarDecl;
    const output = parseQwikCode(input, { path: '/abs/path/router/index.tsx?id=abc#hash' });
    expect(output).toContain(
      'const collecthook = useCollectHooks("/abs/path/router/index.tsx_router")'
    );
  });

  it('supports component$ with FunctionExpression (non-arrow) and injects correctly', () => {
    const src = `
import { component$, useSignal } from '@qwik/dev';

export default component$(function(props){
  const signal = useSignal(0);
  return <div>{signal.value}</div>;
});
`;
    const output = parseQwikCode(src, { path: 'CUSTOM_PATH' });
    // import is handled by plugin layer; parseQwikCode only injects init and payloads
    expect(
      /component\$\(function\([^)]*\)\s*\{[\r\n]+\s*const collecthook = useCollectHooks\(/m.test(
        output
      )
    ).toBe(true);
    const decl = 'const signal = useSignal(0);';
    const declIdx = output.indexOf(decl);
    expect(declIdx).toBeGreaterThan(-1);
    const after = output.slice(declIdx);
    expect(/collecthook\(\s*\{[\s\S]*?data:\s*signal[\s\S]*?\}\);/m.test(after)).toBe(true);
  });

  it('injects collecthook after known hook declarations with correct payload', () => {
    const input = sampleVarDecl;
    const output = parseQwikCode(input, { path: 'CUSTOM_PATH' });
    const declIdx = output.indexOf("const signal = useSignal<any>('111');");
    expect(declIdx).toBeGreaterThan(-1);
    const hookBlock =
      /collecthook\(\s*\{[\s\S]*?variableName:\s*'signal'[\s\S]*?category:\s*'VariableDeclarator'[\s\S]*?data:\s*signal[\s\S]*?\}\);/m;
    const afterDecl = output.slice(declIdx);
    const match = afterDecl.match(hookBlock);
    expect(match).not.toBeNull();
    expect(output).toContain('\n  collecthook({');
    expect(output).toContain('\n    data: signal');
  });

  it('injects for custom use*-not-in-list (e.g. useDebouncer)', () => {
    const input = sampleVarDecl;
    const output = parseQwikCode(input, { path: 'CUSTOM_PATH' });
    // 断言针对 const debounce = useDebouncer(...) 已注入，variableName 为实际变量名
    const regex =
      /collecthook\(\s*\{[\s\S]*?variableName:\s*'debounce'[\s\S]*?hookType:\s*'customhook'[\s\S]*?category:\s*'VariableDeclarator'[\s\S]*?data:\s*debounce[\s\S]*?\}\);/m;
    expect(regex.test(output)).toBe(true);
  });

  it('is idempotent for collecthook insertions', () => {
    const input = sampleVarDecl;
    const once = parseQwikCode(input, { path: 'CUSTOM_PATH' });
    const twice = parseQwikCode(once, { path: 'CUSTOM_PATH' });
    const count = (s: string, sub: string) =>
      (s.match(new RegExp(sub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    expect(count(twice, 'data: signal')).toBe(1);
  });

  it('injects into named component$ (e.g., RouterHead)', () => {
    const routerHead = `import { useDocumentHead, useLocation } from "@qwik.dev/router";
import { component$ } from "@qwik.dev/core";

export const RouterHead = component$(() => {
  const head = useDocumentHead();
  const loc = useLocation();
  return (
    <>
      <title>{head.title}</title>
      <link rel="canonical" href={loc.url.href} />
      {head.meta.map((m) => (
        <meta key={m.key} {...m} />
      ))}
    </>
  );
});
`;
    const output = parseQwikCode(routerHead, { path: '/abs/path/router-head.tsx' });
    expect(output).toContain(
      'const collecthook = useCollectHooks("/abs/path/router-head.tsx_RouterHead")'
    );
  });

  it('injects with exportName for named component$ in index.tsx path', () => {
    const routerHead = `import { useDocumentHead, useLocation } from "@qwik.dev/router";
import { component$ } from "@qwik.dev/core";

export const RouterHead = component$(() => {
  const head = useDocumentHead();
  const loc = useLocation();
  return (
    <>
      <title>{head.title}</title>
      <link rel="canonical" href={loc.url.href} />
      {head.meta.map((m) => (
        <meta key={m.key} {...m} />
      ))}
    </>
  );
});
`;
    const output = parseQwikCode(routerHead, { path: '/abs/path/router/index.tsx' });
    expect(output).toContain(
      'const collecthook = useCollectHooks("/abs/path/router/index.tsx_RouterHead")'
    );
  });

  it('replaces hyphen with underscore for file-based suffix', () => {
    const input = sampleVarDecl;
    const output = parseQwikCode(input, { path: '/abs/path/my-button.tsx' });
    expect(output).toContain(
      'const collecthook = useCollectHooks("/abs/path/my-button.tsx_my_button")'
    );
  });

  it('replaces hyphen with underscore for index.tsx parent dir suffix', () => {
    const input = sampleVarDecl;
    const output = parseQwikCode(input, { path: '/abs/path/my-router/index.tsx' });
    expect(output).toContain(
      'const collecthook = useCollectHooks("/abs/path/my-router/index.tsx_my_router")'
    );
  });

  it('inserts init for every component$ with name-based args when named exports exist', () => {
    const src = `import { component$, useSignal } from '@qwik/dev';

export const A = component$(() => {
  const s1 = useSignal(0);
  return <div>{s1.value}</div>;
});

export const B = component$(() => {
  const s2 = useSignal(1);
  return <div>{s2.value}</div>;
});
`;
    const output = parseQwikCode(src, { path: 'CUSTOM_PATH' });
    const count = (s: string, sub: string) =>
      (s.match(new RegExp(sub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    expect(count(output, 'const collecthook = useCollectHooks')).toBe(2);
    expect(output).toContain('const collecthook = useCollectHooks("CUSTOM_PATH_A")');
    expect(output).toContain('const collecthook = useCollectHooks("CUSTOM_PATH_B")');
    const aFirstStmt = 'const s1 = useSignal(0);';
    const bFirstStmt = 'const s2 = useSignal(1);';
    const aInitIdx = output.indexOf('const collecthook = useCollectHooks("CUSTOM_PATH_A")');
    const aStmtIdx = output.indexOf(aFirstStmt);
    const bInitIdx = output.indexOf('const collecthook = useCollectHooks("CUSTOM_PATH_B")');
    const bStmtIdx = output.indexOf(bFirstStmt);
    expect(aInitIdx).toBeGreaterThan(-1);
    expect(bInitIdx).toBeGreaterThan(-1);
    expect(aStmtIdx).toBeGreaterThan(-1);
    expect(bStmtIdx).toBeGreaterThan(-1);
    expect(aInitIdx).toBeLessThan(aStmtIdx);
    expect(bInitIdx).toBeLessThan(bStmtIdx);
  });
});

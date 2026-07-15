import { describe, expect, test, vi } from 'vitest';
import { createQRL } from '../core/shared/qrl/qrl-class';
import { inlinedQrl } from '../core/shared/qrl/qrl';
import { _val } from '../core/runtime/bind-handlers';
import {
  createSsrNodeId,
  createSsrElementRecord,
  createSsrRecord,
  type SsrReferenceChunk,
} from '../core/ssr/output';
import { useContextProvider, type ContextId } from '../core/runtime/context';
import type { ContextScope } from '../core/runtime/context-scope';
import { getActiveInvokeContext } from '../core/runtime/invoke-context';
import { useTask } from '../core/runtime/task';
import { getLocale } from '../core/runtime/use-locale';
import { useServerData } from '../core/runtime/use-server-data';
import { useSignal } from '../core/reactive/public-api';
import { useOnDocument } from '../core/runtime/use-on';
import {
  renderToStreamCompiled as renderToStream,
  renderToStringCompiled as renderToString,
  type SsrRenderRoot,
} from './ssr-render';

describe('SSR context markers', () => {
  test('passes root props without a JSX wrapper', async () => {
    const result = await renderToString((props: { label: string }) => `<p>${props.label}</p>`, {
      props: { label: 'root-props' },
    });

    expect(result.html).toContain('<p>root-props</p>');
  });
  test('keeps the scope identity separate from its typed root reference', async () => {
    const context = { id: 'ssr-context' } as ContextId<string>;
    let scope!: ContextScope;
    let firstRef!: SsrReferenceChunk;
    let secondRef!: SsrReferenceChunk;

    const result = await renderToString((_props, ctx) => {
      useContextProvider(context, 'value');
      scope = getActiveInvokeContext().localContextScope!;
      firstRef = ctx.contextScopeRef();
      secondRef = ctx.contextScopeRef();
      return [createSsrRecord('<!c=', firstRef, '>'), '<p>value</p>', '<!/c>'];
    });

    expect(firstRef).toEqual({ type: 'root-ref', localId: 0 });
    expect(secondRef).toEqual(firstRef);
    expect(scope.id).toBeNull();
    expect(result.html).toContain('<!c=0><p>value</p><!/c>');
  });

  test('materializes event captures and nested structured output without coercion', async () => {
    const captured = { value: 'captured' };
    const handler = createQRL('./listener.js', '_handler', () => {}, null, [captured]);

    const result = await renderToString((_props, ctx) => [
      createSsrElementRecord('button', '<button', ctx.eventAttr('q-e:click', handler), '>'),
      ['before', [createSsrRecord('<!r=', createSsrNodeId(ctx.nextId()), '>'), 'row', '<!/r>']],
      '</button>',
    ]);

    expect(result.html).toContain(
      '<button q-e:click="listener.js#_handler#0">before<!r=0>row<!/r></button>'
    );
    expect(result.html).not.toContain('[object Object]');
    expect(result.html).not.toContain(',before');
  });

  test('serializes an inlined bind handler capture once', async () => {
    const result = await renderToString((_props, ctx) => {
      const value = useSignal('server');
      ctx.addRoot(value);
      return createSsrElementRecord(
        'input',
        '<input',
        ctx.eventAttr('q-e:input', inlinedQrl(_val, '_val', [value])),
        '>'
      );
    });

    expect(result.html).toMatch(/q-e:input="[^"]+#_val#0"/);
    expect(result.html).toContain('q:len="1"');
  });

  test('keeps structured records intact until the output writer', async () => {
    const chunks: string[] = [];

    await renderToStream(
      (_props, ctx) => [
        'before',
        createSsrElementRecord('span', '<span data-node="', createSsrNodeId(ctx.nextId()), '">'),
        'after</span>',
      ],
      {
        containerTagName: 'div',
        stream: { write: (chunk) => void chunks.push(chunk) },
      }
    );

    expect(chunks.slice(1, -1)).toEqual(['before', '<span data-node="0">', 'after</span>']);
    expect(chunks[chunks.length - 1]).toBe('</div>');
  });

  test('inserts styles into structured document output', async () => {
    const result = await renderToString((_props, ctx) => {
      ctx.styleIds.set('sheet', 'p{color:red}');
      return [
        createSsrElementRecord('head', '<head data-node="', createSsrNodeId(ctx.nextId()), '">'),
        '<title>x</title></head>',
        createSsrElementRecord('body', '<body data-node="', createSsrNodeId(ctx.nextId()), '">'),
        '<p>x</p></body>',
      ];
    });

    expect(result.html).toContain(
      '<head data-node="0"><title>x</title><style q:style="sheet">p{color:red}</style></head>'
    );
    expect(result.html).toContain('<body data-node="1"><p>x</p></body>');
  });

  test('keeps stream and string output identical', async () => {
    const root: SsrRenderRoot = (_props, ctx) => {
      ctx.styleIds.set('sheet', 'p{}');
      return [
        createSsrElementRecord('body', '<body data-node="', createSsrNodeId(ctx.nextId()), '">'),
        '<p>value</p></body>',
      ];
    };
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.25);
    try {
      const stringResult = await renderToString(root);
      const chunks: string[] = [];
      await renderToStream(root, { stream: { write: (chunk) => void chunks.push(chunk) } });

      expect(chunks.join('')).toBe(stringResult.html);
    } finally {
      random.mockRestore();
    }
  });

  test('isolates concurrent request locales', async () => {
    let entered = 0;
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => (release = resolve));
    const root: SsrRenderRoot = async () => {
      const before = getLocale();
      if (++entered === 2) {
        release();
      }
      await barrier;
      return `<p>${before}:${getLocale()}</p>`;
    };

    const [polish, english] = await Promise.all([
      renderToString(root, { locale: 'pl' }),
      renderToString(root, { locale: 'en' }),
    ]);

    expect(polish.html).toContain('<p>pl:pl</p>');
    expect(english.html).toContain('<p>en:en</p>');
  });

  test('keeps request data local while preserving stream and string parity', async () => {
    const root: SsrRenderRoot = () => `<p>${useServerData('value', 'fallback')}</p>`;
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.25);
    try {
      const stringResult = await renderToString(root, {
        serverData: { value: 'request-value', secret: 'unused-server-secret' },
      });
      const chunks: string[] = [];
      await renderToStream(root, {
        serverData: { value: 'request-value', secret: 'unused-server-secret' },
        stream: { write: (chunk) => void chunks.push(chunk) },
      });

      expect(chunks.join('')).toBe(stringResult.html);
      expect(stringResult.html).toContain('<p>request-value</p>');
      expect(stringResult.html).not.toContain('unused-server-secret');
    } finally {
      random.mockRestore();
    }
  });

  test('moves a headless global event carrier into document head', async () => {
    const handler = createQRL('./listener.js', '_handler', () => {}, null, []);
    const result = await renderToString(
      () => {
        useOnDocument('qinit', handler);
        return '<body><p>value</p></body>';
      },
      { containerTagName: 'html' }
    );

    const head = result.html.slice(result.html.indexOf('<head>'), result.html.indexOf('</head>'));
    expect(head).toContain('<script hidden q-d:qinit="listener.js#_handler"></script>');
    expect(result.html.indexOf('<script hidden')).toBeLessThan(result.html.indexOf('<body>'));
  });

  test('flushes task work before serializing the root output', async () => {
    let resolve!: () => void;
    let completed = false;
    const pending = new Promise<void>((done) => (resolve = done));

    const rendering = renderToString(() => {
      useTask(() =>
        pending.then(() => {
          completed = true;
        })
      );
      return '<p>ready</p>';
    });

    await Promise.resolve();
    expect(completed).toBe(false);
    resolve();

    const result = await rendering;
    expect(completed).toBe(true);
    expect(result.html).toContain('<p>ready</p>');
  });
});

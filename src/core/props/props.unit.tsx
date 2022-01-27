import { createDocument } from '../../testing/document';
import { diff, test_clearqPropsCache as test_clearQPropsCache } from './props';
import { getQObjectId } from '../object/q-object';
import { dehydrate } from '../object/store.public';
import { getProps, Props } from './props.public';
import { parseQRL, runtimeQrl } from '../import/qrl';
import { useLexicalScope } from '../use/use-lexical-scope.public';
import { useStore } from '../use/use-state.public';
import { isPromise } from '../util/promises';
import { useEvent } from '../use/use.event.public';
import { newInvokeContext, useInvoke } from '../use/use-core';
import type { QRL } from '../import/qrl.public';

describe('q-element', () => {
  let document: Document;
  let div: HTMLElement;
  let qDiv: Props;
  beforeEach(() => {
    document = createDocument();
    div = document.createElement('div');
    document.body.appendChild(div);
    qDiv = getProps(div);
  });

  it('should retrieve the same instance', () => {
    expect(qDiv).toBe(getProps(div));
  });

  it('should perform basic read/writes', () => {
    qDiv.name = 'Qwik';
    qDiv.age = 42;
    qDiv.isAwesome = true;
    qDiv.myObj = { mark: 'OBJ' };

    expect(qDiv.name).toBe('Qwik');
    expect(div.getAttribute('name')).toEqual('Qwik');
    expect(qDiv.age).toBe(42);
    expect(div.getAttribute('age')).toEqual('42');
    expect(qDiv.isAwesome).toBe(true);
    expect(div.getAttribute('is-awesome')).toEqual('true');
    expect(qDiv.myObj).toEqual({ mark: 'OBJ' });

    test_clearQPropsCache(div);
    qDiv = getProps(div);

    expect(qDiv.name).toBe('Qwik');
    expect(qDiv.age).toBe(42);
    expect(qDiv.isAwesome).toBe(true);
  });

  it('should detect changes', () => {});

  describe('<input>', () => {
    let input: HTMLInputElement;
    let qInput: Props;
    beforeEach(() => {
      input = document.createElement('input');
      qInput = getProps(input);
    });

    it('should write value of inputs', () => {
      qInput.checked = true;
      qInput.value = 'BAR';

      expect((input as any).checked).toBe(true);
      expect(input.getAttribute('checked')).not.toBe(null);

      expect((input as any).value).toBe('BAR');
      expect(input.getAttribute('value')).toBe('BAR');
    });
  });
  it('should serialize innerHTML', () => {
    qDiv.innerHTML = '<span>WORKS</span>';
    test_clearQPropsCache(div);
    qDiv = getProps(div);
    expect(div.getAttribute('inner-h-t-m-l')).toEqual('');
    expect(div.innerHTML.toUpperCase()).toEqual('<SPAN>WORKS</SPAN>');
  });
  it('should serialize innerText', () => {
    qDiv.innerText = 'TEXT';
    test_clearQPropsCache(div);
    qDiv = getProps(div);
    expect(div.getAttribute('inner-text')).toEqual('');
    expect(div.innerText).toEqual('TEXT');
  });

  describe('dehydrate/hydrate', () => {
    it('should serialize QObject', () => {
      const qObj = useStore({ mark: 'QObj' });
      qDiv.myObj = qObj;
      qDiv.ref = { qObj: qObj };
      expect(div.getAttribute('q:obj')).toEqual(getQObjectId(qObj) + ' ' + getQObjectId(qDiv.ref));

      dehydrate(document);
      qDiv = getProps(div);

      expect(qDiv.myObj).toEqual(qObj);
      expect(qDiv.ref.qObj).toEqual(qObj);
    });
  });

  describe('diff', () => {
    it('should detect when difference', () => {
      expect(diff(null, null)).toEqual(null);
      expect(diff(undefined, undefined)).toEqual(null);
      expect(diff('', '')).toEqual(null);
      expect(diff('b', 'b')).toEqual(null);
      expect(diff({}, {})).toEqual(null);
      expect(diff({ name: 'a' }, { name: 'a' })).toEqual(null);
      expect(diff({ name: 'a' }, { name: 'b' })).toEqual([]);
      expect(diff({ name: 'a' }, {})).toEqual([]);
      expect(diff('a', 'c')).toEqual([]);

      const obj1 = useStore({});
      const obj2 = useStore({});

      expect(diff(obj1, obj2)).toEqual([getQObjectId(obj1)]);
      expect(diff(obj1, 'b')).toEqual([getQObjectId(obj1)]);
      expect(diff({ obj1 }, 'b')).toEqual([getQObjectId(obj1)]);
      expect(diff({ obj1, obj2 }, 'b')).toEqual([getQObjectId(obj1), getQObjectId(obj2)]);
    });
  });

  describe('QRLs', () => {
    it('should serialize QRL', () => {
      qDiv['on:click'] = './path#symbol';
      qDiv['on:dblclick'] = parseQRL('./path#symbol[{"foo": "bar"}]');

      expect(div.getAttribute('on:click')).toEqual('./path#symbol');
      expect(div.getAttribute('on:dblclick')).toEqual('./path#symbol[{"foo":"bar"}]');
    });

    it('should overwrite QRL', () => {
      qDiv['onDocument:click'] = './path#symbol';
      qDiv['onDocument:click'] = parseQRL('./path#symbol[{"foo": "bar"}]');

      expect(div.getAttribute('on-document:click')).toEqual('./path#symbol[{"foo":"bar"}]');
    });

    it('should add if different QRL', () => {
      qDiv['onWindow:click'] = './path#symbol1';
      qDiv['onWindow:click'] = parseQRL('./path#symbol[{"foo": "bar"}]');

      expect(div.getAttribute('on-window:click')?.split('\n')).toEqual([
        './path#symbol1',
        './path#symbol[{"foo":"bar"}]',
      ]);
    });

    it('should read qrl as single function', async () => {
      qDiv['on:qRender'] = 'markAsHost';
      const state = useStore({ mark: 'implicit', isHost: null, args: null });
      const stateExplicit = useStore({ mark: 'explicit', isHost: null, args: null });
      qDiv.isHost = 'YES';

      const child = document.createElement('child');
      div.appendChild(child);
      const qChild = getProps(child) as any;
      qChild['on:click'] = runtimeQrl(implicitHandler, [qDiv, state, { mark: 'ARGS WORK' }]);
      qChild['on:click'] = runtimeQrl(explicitHandler, [qDiv, stateExplicit, { '.': 'explicit' }]);
      await useInvoke(newInvokeContext(child, 'EVENT'), qChild['on:click']);

      expect(state.mark).toBe('implicit');
      expect(state.isHost).toBe('YES');
      expect(state.args).toEqual({ mark: 'ARGS WORK' });

      expect(stateExplicit.mark).toBe('explicit');
      expect(stateExplicit.isHost).toBe('YES');
      expect(stateExplicit.args).toEqual({ '.': 'explicit' });
    });

    it('should accept a promise of QRL and return it resolved', async () => {
      let resolve!: (qrl: QRL) => void;
      const log: any[] = [];
      const onRenderPromise = new Promise((res) => (resolve = res));
      qDiv['on:qRender'] = onRenderPromise;
      const renderPromise = useInvoke(newInvokeContext(div, 'qRender'), qDiv['on:qRender']);
      expect(isPromise(renderPromise)).toBe(true);
      resolve(
        runtimeQrl(() => {
          log.push('WORKS', useEvent());
          return useEvent();
        })
      );
      expect(await renderPromise).toEqual(['qRender']);
      expect(log).toEqual(['WORKS', 'qRender']);
    });
  });

  describe('traverse', () => {
    it('should return logical parent', () => {
      const parent = document.createElement('parent');
      parent.appendChild(div);
      expect(qDiv.__parent__).toBe(getProps(parent));
      expect(qDiv.__parent__.__parent__).toBe(null);
    });
  });
});

const implicitHandler = () => {
  const [props, state, args] = useLexicalScope();
  state.isHost = props.isHost;
  state.args = args;
};
const explicitHandler = () => {
  const [props, state, args] = useLexicalScope();
  state.isHost = props.isHost;
  state.args = args;
};

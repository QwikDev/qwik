import { createDocument } from '../../testing/document';
import { qHook } from '../component/qrl-hook.public';
import { ParsedQRL } from '../import/qrl';
import { diff, test_clearqPropsCache as test_clearQPropsCache } from './q-props';
import type { QComponent } from '../component/q-component.public';
import { qObject } from '../object/q-object.public';
import { getQObjectId, _qObject } from '../object/q-object';
import { qDehydrate } from '../object/q-store.public';
import { qProps, QProps } from './q-props.public';

describe('q-element', () => {
  let document: Document;
  let div: HTMLElement;
  let qDiv: QProps;
  beforeEach(() => {
    document = createDocument();
    div = document.createElement('div');
    document.body.appendChild(div);
    qDiv = qProps(div);
  });

  it('should retrieve the same instance', () => {
    expect(qDiv).toBe(qProps(div));
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
    qDiv = qProps(div);

    expect(qDiv.name).toBe('Qwik');
    expect(qDiv.age).toBe(42);
    expect(qDiv.isAwesome).toBe(true);
  });

  it('should detect changes', () => {});

  describe('<input>', () => {
    let input: HTMLInputElement;
    let qInput: QProps;
    beforeEach(() => {
      input = document.createElement('input');
      qInput = qProps(input);
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
    qDiv = qProps(div);
    expect(div.getAttribute('inner-h-t-m-l')).toEqual('');
    expect(div.innerHTML.toUpperCase()).toEqual('<SPAN>WORKS</SPAN>');
  });
  it('should serialize innerText', () => {
    qDiv.innerText = 'TEXT';
    test_clearQPropsCache(div);
    qDiv = qProps(div);
    expect(div.getAttribute('inner-text')).toEqual('');
    expect(div.innerText).toEqual('TEXT');
  });

  describe('dehydrate/hydrate', () => {
    it('should serialize QObject', () => {
      const qObj = qObject({ mark: 'QObj' });
      qDiv.myObj = qObj;
      qDiv.ref = { qObj: qObj };
      expect(div.getAttribute('q:obj')).toEqual(getQObjectId(qObj) + ' ' + getQObjectId(qDiv.ref));

      qDehydrate(document);
      qDiv = qProps(div);

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

      const obj1 = qObject({});
      const obj2 = qObject({});

      expect(diff(obj1, obj2)).toEqual([getQObjectId(obj1)]);
      expect(diff(obj1, 'b')).toEqual([getQObjectId(obj1)]);
      expect(diff({ obj1 }, 'b')).toEqual([getQObjectId(obj1)]);
      expect(diff({ obj1, obj2 }, 'b')).toEqual([getQObjectId(obj1), getQObjectId(obj2)]);
    });
  });

  describe('state', () => {
    it('should retrieve state by name', () => {
      const state1 = _qObject({ mark: 1 }, '');
      const state2 = _qObject({ mark: 2 }, 'foo');
      qDiv['state:'] = state1;
      qDiv['state:foo'] = state2;

      qDehydrate(document);
      qDiv = qProps(div);

      expect(qDiv['state:']).toEqual(state1);
      expect(qDiv['state:foo']).toEqual(state2);
    });
  });

  describe('QRLs', () => {
    it('should serialize QRL', () => {
      qDiv['on:click'] = './path#symbol';
      qDiv['on:dblclick'] = new ParsedQRL('./path', 'symbol', { foo: 'bar' });

      expect(div.getAttribute('on:click')).toEqual('./path#symbol');
      expect(div.getAttribute('on:dblclick')).toEqual('./path#symbol?foo=bar');
    });
    it('should overwrite QRL', () => {
      qDiv['on:click'] = './path#symbol';
      qDiv['on:click'] = new ParsedQRL('./path', 'symbol', { foo: 'bar' });

      expect(div.getAttribute('on:click')).toEqual('./path#symbol?foo=bar');
    });
    it('should add if different QRL', () => {
      qDiv['on:click'] = './path#symbol1';
      qDiv['on:click'] = new ParsedQRL('./path', 'symbol', { foo: 'bar' });

      expect(div.getAttribute('on:click')).toEqual('./path#symbol1\n./path#symbol?foo=bar');
    });
    it('should add QRL if different state', () => {
      qDiv['on:click'] = './path#symbol?.=bar';
      qDiv['on:click'] = new ParsedQRL('./path', 'symbol', { foo: 'bar' });

      expect(div.getAttribute('on:click')).toEqual('./path#symbol?.=bar\n./path#symbol?foo=bar');

      qDiv['on:click'] = './path#symbol?.=bar&foo=bar';
      expect(div.getAttribute('on:click')).toEqual(
        './path#symbol?.=bar&foo=bar\n./path#symbol?foo=bar'
      );
    });

    it('should read qrl as single function', async () => {
      qDiv['on:qRender'] = 'markAsHost';
      qDiv['state:'] = _qObject({ mark: 'implicit' }, '');
      qDiv['state:explicit'] = _qObject({ mark: 'explicit' }, 'explicit');
      qDiv.isHost = 'YES';

      const child = document.createElement('child');
      div.appendChild(child);
      const qChild = qProps(child) as any;
      qChild['on:click'] = implicitHandler.with({ mark: 'ARGS WORK' });
      qChild['on:click'] = explicitHandler;
      await qChild['on:click']('EVENT');

      expect(qDiv['state:'].mark).toBe('implicit');
      expect(qDiv['state:'].isHost).toBe('YES');
      expect(qDiv['state:'].args).toEqual({ mark: 'ARGS WORK' });

      expect(qDiv['state:explicit'].mark).toBe('explicit');
      expect(qDiv['state:explicit'].isHost).toBe('YES');
      expect(qDiv['state:explicit'].args).toEqual({ '.': 'explicit' });
      expect(div.getAttribute('q:obj')).toEqual(
        [getQObjectId(qDiv['state:']), getQObjectId(qDiv['state:explicit'])].join(' ')
      );
    });

    it('should restore QRLs from attribute', () => {
      // TODO(misko) : implement
    });

    describe('traverse', () => {
      it('should return logical parent', () => {
        const parent = document.createElement('parent');
        parent.appendChild(div);
        expect(qDiv.__parent__).toBe(qProps(parent));
        expect(qDiv.__parent__.__parent__).toBe(null);
      });
    });
  });
});

const implicitHandler = qHook((props: any, state: any, args: any) => {
  state.isHost = props.isHost;
  state.args = args;
});
const explicitHandler = qHook<QComponent, {}>((props, state, args) => {
  state.isHost = props.isHost;
  state.args = args;
}).with({ '.': 'explicit' });

import { test } from 'uvu';
import { equal, throws } from 'uvu/assert';
import { validateSerializable, msToString } from './format';

[
  {
    ms: 0.05,
    expect: '0.05 ms',
  },
  {
    ms: 10.5,
    expect: '10.5 ms',
  },
  {
    ms: 100,
    expect: '100.0 ms',
  },
  {
    ms: 2000,
    expect: '2.0 s',
  },
  {
    ms: 120000,
    expect: '2.0 m',
  },
].forEach((t) => {
  test(`msToString(${t.ms})`, () => {
    equal(msToString(t.ms), t.expect);
  });
});

[
  {
    val: true,
    throws: false,
  },
  {
    val: false,
    throws: false,
  },
  {
    val: null,
    throws: false,
  },
  {
    val: undefined,
    throws: false,
  },
  {
    val: 'string',
    throws: false,
  },
  {
    val: 88,
    throws: false,
  },
  {
    val: {},
    throws: false,
  },
  {
    val: Object.create(null),
    throws: false,
  },
  {
    val: {
      num: 88,
      str: 'string',
      bool: true,
      nl: null,
      undef: undefined,
    },
    throws: false,
  },
  {
    val: new Map(),
    throws: true,
  },
  {
    val: {
      obj: {
        set: new Set(),
      },
    },
    throws: true,
  },
].forEach((t) => {
  test(`isSerializable(${JSON.stringify(t.val)})`, () => {
    if (t.throws) {
      throws(() => {
        validateSerializable(t.val);
      });
    } else {
      validateSerializable(t.val);
    }
  });
});

test(`not isSerializable if circular`, () => {
  const obj: any = {};
  obj.obj = obj;
  throws(() => {
    validateSerializable(obj);
  });
});

test.run();

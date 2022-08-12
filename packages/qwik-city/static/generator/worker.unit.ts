import { test } from 'uvu';
import { equal } from 'uvu/assert';
import { collectAnchorHrefs } from './utils';

test('collectAnchorHrefs', () => {
  const tests = [
    {
      c: `<a href="aaa">111</a><a href="bbb"><a href="ccc">333</a></a>`,
      expect: ['/aaa', '/bbb', '/ccc'],
    },
    {
      c: `<a href="aaa">111</a><a href="aaa"><a href="aaa">333</a></a>`,
      expect: ['/aaa'],
    },
    {
      c: `<a href="about://blank">123</a></span>`,
      expect: [],
    },
    {
      c: `<a href="http://abc.com">123</a></span>`,
      expect: [],
    },
    {
      c: `<a href="./abc/../path">123</a></span>`,
      expect: ['/path'],
    },
    {
      c: `<a href="./path">123</a></span>`,
      expect: ['/path'],
    },
    {
      c: `<a  z  \t     href  \n\n  =    "path">123</a></span>`,
      expect: ['/path'],
    },
    {
      c: `<a z href="path" x>123</a></span>`,
      expect: ['/path'],
    },
    {
      c: `<a href = 'path' x>123</a></span>`,
      expect: ['/path'],
    },
    {
      c: `<a href='path'  x>123</a></span>`,
      expect: ['/path'],
    },
    {
      c: `<a x href = path z>123</a></span>`,
      expect: ['/path'],
    },
    {
      c: `<a x href=path z>123</a></span>`,
      expect: ['/path'],
    },
    {
      c: '<span><a></a></span>',
      expect: [],
    },
    {
      c: '<span><a href="  #  "  ></a></span>',
      expect: [],
    },
    {
      c: '<span><a href=""  ></a></span>',
      expect: [],
    },
    {
      c: '<span><a href=  ></a></span>',
      expect: [],
    },
    {
      c: '<span><a href  ></a></span>',
      expect: [],
    },
    {
      c: '<a>asdfasdf</a>',
      expect: [],
    },
    {
      c: '<span></span>',
      expect: [],
    },
    {
      c: '<span>asd',
      expect: [],
    },
    {
      c: '',
      expect: [],
    },
  ];

  tests.forEach((t) => {
    const b = { c: t.c };
    const pathnames = new Set<string>();
    const url = new URL('https://qwik.builder.io/');
    collectAnchorHrefs(b, pathnames, url);
    equal(Array.from(pathnames).sort(), Array.from(t.expect).sort());
  });
});

test.run();

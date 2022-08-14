import { test } from 'uvu';
import { equal } from 'uvu/assert';
import { collectAnchorHrefs, msToString } from './utils';

test('collectAnchorHrefs chunks', () => {
  const b = { c: '' };
  const pathnames = new Set<string>();
  const url = new URL('https://qwik.builder.io/');
  const chunks = [
    { chunk: '', expect: [] },
    { chunk: '<span>', expect: [] },
    { chunk: '<a href=', expect: [] },
    { chunk: '"/abc', expect: [] },
    { chunk: '"', expect: [] },
    { chunk: '>', expect: ['/abc'] },
    { chunk: '</span>', expect: ['/abc'] },
    { chunk: '<a ', expect: ['/abc'] },
    { chunk: ' href="/efg"', expect: ['/abc'] },
    { chunk: '>', expect: ['/abc', '/efg'] },
    { chunk: '<', expect: ['/abc', '/efg'] },
    { chunk: 'a', expect: ['/abc', '/efg'] },
    { chunk: ' hr', expect: ['/abc', '/efg'] },
    { chunk: 'ef', expect: ['/abc', '/efg'] },
    { chunk: '  ="', expect: ['/abc', '/efg'] },
    { chunk: '/xy', expect: ['/abc', '/efg'] },
    { chunk: 'z"   ', expect: ['/abc', '/efg'] },
    { chunk: '   ', expect: ['/abc', '/efg'] },
    { chunk: '>', expect: ['/abc', '/efg', '/xyz'] },
  ];

  chunks.forEach((t) => {
    b.c += t.chunk;
    collectAnchorHrefs(b, pathnames, url);
    equal(Array.from(pathnames).sort(), Array.from(t.expect).sort());
  });
});

test('collectAnchorHrefs', () => {
  const tests = [
    {
      c: `<header><div class="header-inner"><section class="logo"><a href="/" data-test-link="header-home">Qwik City 🏙</a></section><nav data-test-header-links="true"><a href="/blog" data-test-link="blog-home">Blog</a><a href="/docs" data-test-link="docs-home">Docs</a><a href="/api" data-test-link="api-home">API</a><a href="/products/hat" data-test-link="products-hat">Products</a><a href="/about-us" data-test-link="about-us">About Us</a><a href="/sign-in" data-test-link="sign-in">Sign In</a></nav></div></header>`,
      expect: ['/', '/about-us', '/api', '/blog', '/docs', '/products/hat', '/sign-in'],
    },
    {
      c: `<template><a href="aaa">111</a></template>`,
      expect: [],
    },
    {
      c: `<span><a href="aaa">111</a></span><script><a href="bbb">111</a></script><a href="ccc">111</a>`,
      expect: ['/aaa', '/ccc'],
    },
    {
      c: `<span></span><script><a href="aaa">111</a></script>`,
      expect: [],
    },
    {
      c: `<script><a href="aaa">111</a>`,
      expect: [],
    },
    {
      c: `<script></script><a href="aaa">111</a>`,
      expect: ['/aaa'],
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
      c: `<a href={asdf}>`,
      expect: [],
    },
    {
      c: `<a href=>`,
      expect: [],
    },
    {
      c: `<a href=path   `,
      expect: [],
    },
    {
      c: '<span><a></a></span>',
      expect: [],
    },
    {
      c: '<span><a href="  #  "  ></a></span>',
      expect: ['/'],
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

test('collectAnchorHrefs', () => {
  const tests = [
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
  ];

  tests.forEach((t) => {
    equal(msToString(t.ms), t.expect);
  });
});

test.run();

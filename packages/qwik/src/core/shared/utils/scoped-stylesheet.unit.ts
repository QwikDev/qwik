import { assert, test } from 'vitest';
import { scopeStylesheet } from './scoped-stylesheet';

test('selectors', () => {
  assert.equal(scopeStylesheet('div {}', '_'), 'div.⭐️_ {}');
  assert.equal(scopeStylesheet('div {}div{} div {}', '_'), 'div.⭐️_ {}div.⭐️_{} div.⭐️_ {}');
  assert.equal(scopeStylesheet('div, p {}', '_'), 'div.⭐️_, p.⭐️_ {}');

  assert.equal(scopeStylesheet('div p {}', '_'), 'div.⭐️_ p.⭐️_ {}');
  assert.equal(scopeStylesheet('div > p {}', '_'), 'div.⭐️_ > p.⭐️_ {}');
  assert.equal(scopeStylesheet('div + p {}', '_'), 'div.⭐️_ + p.⭐️_ {}');
  assert.equal(scopeStylesheet('div ~ p {}', '_'), 'div.⭐️_ ~ p.⭐️_ {}');

  assert.equal(scopeStylesheet('.red {}', '_'), '.red.⭐️_ {}');
  assert.equal(scopeStylesheet('div.red {}', '_'), 'div.red.⭐️_ {}');
});
test('unicode', () => {
  assert.equal(scopeStylesheet('.miško{}', '_'), '.miško.⭐️_{}');
});
test('selectors with *', () => {
  assert.equal(scopeStylesheet('* {}', '_'), '.⭐️_ {}');
  assert.equal(scopeStylesheet('.red * {}', '_'), '.red.⭐️_ .⭐️_ {}');
  assert.equal(scopeStylesheet('#red * {}', '_'), '#red.⭐️_ .⭐️_ {}');
});

test('selectors with chains', () => {
  assert.equal(scopeStylesheet('.red.text {}', '_'), '.red.text.⭐️_ {}');

  assert.equal(scopeStylesheet('#red {}', '_'), '#red.⭐️_ {}');
  assert.equal(scopeStylesheet('div#red {}', '_'), 'div#red.⭐️_ {}');

  assert.equal(scopeStylesheet('div { }', '_'), 'div.⭐️_ { }');
  assert.equal(scopeStylesheet('div {}', '_'), 'div.⭐️_ {}');
  assert.equal(
    scopeStylesheet('div {background-color: blue; }', '_'),
    'div.⭐️_ {background-color: blue; }'
  );
  assert.equal(
    scopeStylesheet('div { color: red !important; }', '_'),
    'div.⭐️_ { color: red !important; }'
  );
  assert.equal(scopeStylesheet('div{color:red;}', '_'), 'div.⭐️_{color:red;}');
  assert.equal(scopeStylesheet('div { content: "}"; }', '_'), 'div.⭐️_ { content: "}"; }');
  assert.equal(scopeStylesheet("div { content: '}'; }", '_'), "div.⭐️_ { content: '}'; }");
});

test('attribute selectors', () => {
  assert.equal(scopeStylesheet('*[a]{}', '_'), '[a].⭐️_{}');
  assert.equal(scopeStylesheet('*[a] {}', '_'), '[a].⭐️_ {}');
  assert.equal(scopeStylesheet('*[target] span {}', '_'), '[target].⭐️_ span.⭐️_ {}');

  assert.equal(scopeStylesheet('a[target] {}', '_'), 'a[target].⭐️_ {}');
  assert.equal(scopeStylesheet('a[target="_blank"] {}', '_'), 'a[target="_blank"].⭐️_ {}');
  assert.equal(scopeStylesheet('input[type="button"] {}', '_'), 'input[type="button"].⭐️_ {}');

  assert.equal(scopeStylesheet('a[title~="red"] {}', '_'), 'a[title~="red"].⭐️_ {}');
  assert.equal(scopeStylesheet('a[class^="red"] {}', '_'), 'a[class^="red"].⭐️_ {}');
  assert.equal(scopeStylesheet('a[class|="red"] {}', '_'), 'a[class|="red"].⭐️_ {}');
  assert.equal(scopeStylesheet('a[class*="red"] {}', '_'), 'a[class*="red"].⭐️_ {}');
  assert.equal(scopeStylesheet('a[class$="red"] {}', '_'), 'a[class$="red"].⭐️_ {}');
});

test('pseudo classes', () => {
  assert.equal(scopeStylesheet('p:lang(en) {}', '_'), 'p:lang(en).⭐️_ {}');
  assert.equal(scopeStylesheet('a:link {}', '_'), 'a:link.⭐️_ {}');
  assert.equal(scopeStylesheet('p:nth-child(2) {}', '_'), 'p:nth-child(2).⭐️_ {}');
  assert.equal(scopeStylesheet('p:nth-child(3n+1) {}', '_'), 'p:nth-child(3n+1).⭐️_ {}');
});
test('pseudo classes without selector', () => {
  assert.equal(scopeStylesheet(':root {}', '_'), ':root.⭐️_ {}');
});
test('pseudo selector with negation', () => {
  assert.equal(scopeStylesheet('p:not(.blue) {}', '_'), 'p:not(.blue.⭐️_).⭐️_ {}');
});
test('pseudo selector with :nth', () => {
  assert.equal(
    scopeStylesheet('p:nth-child(3n+1):hover {}', '_'),
    'p:nth-child(3n+1):hover.⭐️_ {}'
  );
  assert.equal(
    scopeStylesheet('p:nth-child(3n+1) div {}', '_'),
    'p:nth-child(3n+1).⭐️_ div.⭐️_ {}'
  );
});

test('pseudo elements', () => {
  assert.equal(scopeStylesheet('::selection {}', '_'), '.⭐️_::selection {}');
  assert.equal(scopeStylesheet(' ::space {}', '_'), ' .⭐️_::space {}');

  assert.equal(scopeStylesheet('a::before {}', '_'), 'a.⭐️_::before {}');
  assert.equal(scopeStylesheet('a::after {}', '_'), 'a.⭐️_::after {}');

  assert.equal(scopeStylesheet('a::first-line {}', '_'), 'a.⭐️_::first-line {}');

  assert.equal(scopeStylesheet('a.red::before {}', '_'), 'a.red.⭐️_::before {}');
  assert.equal(scopeStylesheet('a.red span::before {}', '_'), 'a.red.⭐️_ span.⭐️_::before {}');
  ['before', 'after', 'first-letter', 'first-line'].forEach((selector) => {
    assert.equal(scopeStylesheet(`:${selector} {}`, '_'), `.⭐️_:${selector} {}`);
    assert.equal(scopeStylesheet(`a:${selector} {}`, '_'), `a.⭐️_:${selector} {}`);
  });
});

test('complex properties', () => {
  assert.equal(
    scopeStylesheet('div { background: #D0E4F5 url("./bg.jpg") no-repeat scroll 0 0; }', '_'),
    'div.⭐️_ { background: #D0E4F5 url("./bg.jpg") no-repeat scroll 0 0; }'
  );

  assert.equal(
    scopeStylesheet(
      'div { background: -webkit-linear-gradient(left, #1C6EA4 0%, #2388CB 50%, #144E75 100%); }',
      '_'
    ),
    'div.⭐️_ { background: -webkit-linear-gradient(left, #1C6EA4 0%, #2388CB 50%, #144E75 100%); }'
  );
});

test('@keyframe', () => {
  assert.equal(
    scopeStylesheet('@keyframes slidein {from{b:c(0%);}to{b:c(0%);}}', '_'),
    '@keyframes slidein {from{b:c(0%);}to{b:c(0%);}}'
  );
  assert.equal(
    scopeStylesheet('@-prefix-keyframes slidein {from{b:c(0%);}to{b:c(0%);}}', '_'),
    '@-prefix-keyframes slidein {from{b:c(0%);}to{b:c(0%);}}'
  );
});

test('animation-name', () => {
  assert.equal(scopeStylesheet('p{animation-name: x}', '_'), 'p.⭐️_{animation-name: x}');
});

test('animation', () => {
  assert.equal(scopeStylesheet('p{animation: a b c }', '_'), 'p.⭐️_{animation: a b c }');
});

test('@font-face', () => {
  assert.equal(
    scopeStylesheet(
      '@font-face { font-family: "Open Sans"; src: url("/fonts/OpenSans-Regular-webfont.woff2") format("woff2"), url("/fonts/OpenSans-Regular-webfont.woff") format("woff"); }',
      '_'
    ),
    '@font-face { font-family: "Open Sans"; src: url("/fonts/OpenSans-Regular-webfont.woff2") format("woff2"), url("/fonts/OpenSans-Regular-webfont.woff") format("woff"); }'
  );
});

test('@media', () => {
  assert.equal(
    scopeStylesheet('@media screen and (min-width: 900px) { div {} }', '_'),
    '@media screen and (min-width: 900px) { div.⭐️_ {} }'
  );
});

test('@container', () => {
  assert.equal(
    scopeStylesheet('@container (min-width: 1px) { div {} span {} }', '_'),
    '@container (min-width: 1px) { div.⭐️_ {} span.⭐️_ {} }'
  );
});

test('@supports', () => {
  assert.equal(
    scopeStylesheet(
      '@supports (display: flex) { @media screen and (min-width: 900px) { div {} } }',
      '_'
    ),
    '@supports (display: flex) { @media screen and (min-width: 900px) { div.⭐️_ {} } }'
  );
});

test('@supports nested', () => {
  assert.equal(scopeStylesheet('@media screen(a:1){}div{}', '_'), '@media screen(a:1){}div.⭐️_{}');

  assert.equal(
    scopeStylesheet('@supports(d:b){div{}@media screen(a:1){div{}}div{}}', '_'),
    '@supports(d:b){div.⭐️_{}@media screen(a:1){div.⭐️_{}}div.⭐️_{}}'
  );

  assert.equal(
    scopeStylesheet('@supports not (not (transform-origin: 2px)) { div {} }', '_'),
    '@supports not (not (transform-origin: 2px)) { div.⭐️_ {} }'
  );
  assert.equal(
    scopeStylesheet('@supports (display: grid) and (not (display: inline-grid)) { div {} }', '_'),
    '@supports (display: grid) and (not (display: inline-grid)) { div.⭐️_ {} }'
  );

  assert.equal(
    scopeStylesheet(
      '@supports ((perspective: 10px) or (-moz-perspective: 10px) or (-webkit-perspective: 10px) or (-ms-perspective: 10px) or (-o-perspective: 10px)) { div {} }',
      '_'
    ),
    '@supports ((perspective: 10px) or (-moz-perspective: 10px) or (-webkit-perspective: 10px) or (-ms-perspective: 10px) or (-o-perspective: 10px)) { div.⭐️_ {} }'
  );
});

test('comments', () => {
  assert.equal(scopeStylesheet('div {} /* comment */', '_'), 'div.⭐️_ {} /* comment */');
  assert.equal(scopeStylesheet('div { /**/ }', '_'), 'div.⭐️_ { /**/ }');
  assert.equal(scopeStylesheet('div /* comment */ {}', '_'), 'div.⭐️_ /* comment */ {}');
  assert.equal(scopeStylesheet('div/* comment */ {}', '_'), 'div.⭐️_/* comment */ {}');
  assert.equal(scopeStylesheet('/* comment */div {}', '_'), '/* comment */div.⭐️_ {}');
  assert.equal(
    scopeStylesheet('div /* comment */ > span {}', '_'),
    'div.⭐️_ /* comment */ > span.⭐️_ {}'
  );
});

test('global selector', () => {
  assert.equal(scopeStylesheet(':global(*) {}', '_'), '* {}');
});
test('global selector with attribute', () => {
  assert.equal(scopeStylesheet(':global([t="("]) {}', '_'), '[t="("] {}');

  assert.equal(scopeStylesheet(':global(div) {}', '_'), 'div {}');
  assert.equal(scopeStylesheet(':global(div), p {}', '_'), 'div, p.⭐️_ {}');

  assert.equal(scopeStylesheet('div :global(p) {}', '_'), 'div.⭐️_ p {}');
  assert.equal(scopeStylesheet(':global(div) > p {}', '_'), 'div > p.⭐️_ {}');

  assert.equal(scopeStylesheet(':global(.red) {}', '_'), '.red {}');
  assert.equal(scopeStylesheet(':global(div).red {}', '_'), 'div.red.⭐️_ {}');
  assert.equal(scopeStylesheet(':global(div.red) {}', '_'), 'div.red {}');

  assert.equal(scopeStylesheet(':global(#red) {}', '_'), '#red {}');

  assert.equal(scopeStylesheet(':global(div) { }', '_'), 'div { }');
  assert.equal(scopeStylesheet(':global(div) {}', '_'), 'div {}');
  assert.equal(scopeStylesheet(':global(div){color:red;}', '_'), 'div{color:red;}');

  assert.equal(scopeStylesheet(':global(*[target]) {}', '_'), '*[target] {}');
  assert.equal(scopeStylesheet(':global(*[target]) span {}', '_'), '*[target] span.⭐️_ {}');
  assert.equal(scopeStylesheet('*[target] :global(span) {}', '_'), '[target].⭐️_ span {}');

  assert.equal(scopeStylesheet(':global(a):link {}', '_'), 'a:link.⭐️_ {}');
  assert.equal(scopeStylesheet(':global(a:link) {}', '_'), 'a:link {}');
  assert.equal(scopeStylesheet(':global(p:lang(en)) {}', '_'), 'p:lang(en) {}');
  assert.equal(scopeStylesheet(':global(p:nth-child(2)) {}', '_'), 'p:nth-child(2) {}');
  assert.equal(scopeStylesheet(':global(:root) {}', '_'), ':root {}');
  assert.equal(scopeStylesheet(':global(p:not(.blue)) {}', '_'), 'p:not(.blue) {}');
});

test('nested global inside not', () => {
  assert.equal(scopeStylesheet('p:not(:global(.red)){}', '_'), 'p:not(.red).⭐️_{}');

  assert.equal(
    scopeStylesheet(':global(p:nth-child(3n+1):hover) {}', '_'),
    'p:nth-child(3n+1):hover {}'
  );
  assert.equal(
    scopeStylesheet(':global(p:nth-child(3n+1) div) {}', '_'),
    'p:nth-child(3n+1) div {}'
  );

  assert.equal(scopeStylesheet(':global(::selection) {}', '_'), '::selection {}');
});
test('global with pseudo element', () => {
  assert.equal(scopeStylesheet(':global(a::after){}', '_'), 'a::after{}');
  // assert.equal(scopeStylesheet(':global(a)::before{}', '_'), 'a::before{}');

  assert.equal(scopeStylesheet(':global(a).red::before {}', '_'), 'a.red.⭐️_::before {}');
  assert.equal(
    scopeStylesheet(':global(a.red) span::before {}', '_'),
    'a.red span.⭐️_::before {}'
  );
});

test('global with pseudo element', () => {
  assert.equal(
    scopeStylesheet(
      '@keyframes :global(slidein) { from { transform: translateX(0%); } to { transform: translateX(100%); } }',
      '_'
    ),
    '@keyframes slidein { from { transform: translateX(0%); } to { transform: translateX(100%); } }'
  );
  assert.equal(
    scopeStylesheet('@media screen and (min-width: 900px) { :global(div) {} }', '_'),
    '@media screen and (min-width: 900px) { div {} }'
  );
});

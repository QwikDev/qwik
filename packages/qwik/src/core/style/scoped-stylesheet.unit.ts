import { suite } from 'uvu';
import { equal } from 'uvu/assert';
import { scopeStylesheet } from './scoped-stylesheet';

const scopedStyles = suite('scopedStyles');

scopedStyles('selectors', () => {
  equal(scopeStylesheet('div {}', '_'), 'div.⭐️_ {}');
  equal(scopeStylesheet('div {}div{} div {}', '_'), 'div.⭐️_ {}div.⭐️_{} div.⭐️_ {}');
  equal(scopeStylesheet('div, p {}', '_'), 'div.⭐️_, p.⭐️_ {}');

  equal(scopeStylesheet('div p {}', '_'), 'div.⭐️_ p.⭐️_ {}');
  equal(scopeStylesheet('div > p {}', '_'), 'div.⭐️_ > p.⭐️_ {}');
  equal(scopeStylesheet('div + p {}', '_'), 'div.⭐️_ + p.⭐️_ {}');
  equal(scopeStylesheet('div ~ p {}', '_'), 'div.⭐️_ ~ p.⭐️_ {}');

  equal(scopeStylesheet('.red {}', '_'), '.red.⭐️_ {}');
  equal(scopeStylesheet('div.red {}', '_'), 'div.red.⭐️_ {}');
});
scopedStyles('unicode', () => {
  equal(scopeStylesheet('.miško{}', '_'), '.miško.⭐️_{}');
});
scopedStyles('selectors with *', () => {
  equal(scopeStylesheet('* {}', '_'), '.⭐️_ {}');
  equal(scopeStylesheet('.red * {}', '_'), '.red.⭐️_ .⭐️_ {}');
  equal(scopeStylesheet('#red * {}', '_'), '#red.⭐️_ .⭐️_ {}');
});

scopedStyles('selectors with chains', () => {
  equal(scopeStylesheet('.red.text {}', '_'), '.red.text.⭐️_ {}');

  equal(scopeStylesheet('#red {}', '_'), '#red.⭐️_ {}');
  equal(scopeStylesheet('div#red {}', '_'), 'div#red.⭐️_ {}');

  equal(scopeStylesheet('div { }', '_'), 'div.⭐️_ { }');
  equal(scopeStylesheet('div {}', '_'), 'div.⭐️_ {}');
  equal(
    scopeStylesheet('div {background-color: blue; }', '_'),
    'div.⭐️_ {background-color: blue; }'
  );
  equal(
    scopeStylesheet('div { color: red !important; }', '_'),
    'div.⭐️_ { color: red !important; }'
  );
  equal(scopeStylesheet('div{color:red;}', '_'), 'div.⭐️_{color:red;}');
  equal(scopeStylesheet('div { content: "}"; }', '_'), 'div.⭐️_ { content: "}"; }');
  equal(scopeStylesheet("div { content: '}'; }", '_'), "div.⭐️_ { content: '}'; }");
});

scopedStyles('attribute selectors', () => {
  equal(scopeStylesheet('*[a]{}', '_'), '[a].⭐️_{}');
  equal(scopeStylesheet('*[a] {}', '_'), '[a].⭐️_ {}');
  equal(scopeStylesheet('*[target] span {}', '_'), '[target].⭐️_ span.⭐️_ {}');

  equal(scopeStylesheet('a[target] {}', '_'), 'a[target].⭐️_ {}');
  equal(scopeStylesheet('a[target="_blank"] {}', '_'), 'a[target="_blank"].⭐️_ {}');
  equal(scopeStylesheet('input[type="button"] {}', '_'), 'input[type="button"].⭐️_ {}');

  equal(scopeStylesheet('a[title~="red"] {}', '_'), 'a[title~="red"].⭐️_ {}');
  equal(scopeStylesheet('a[class^="red"] {}', '_'), 'a[class^="red"].⭐️_ {}');
  equal(scopeStylesheet('a[class|="red"] {}', '_'), 'a[class|="red"].⭐️_ {}');
  equal(scopeStylesheet('a[class*="red"] {}', '_'), 'a[class*="red"].⭐️_ {}');
  equal(scopeStylesheet('a[class$="red"] {}', '_'), 'a[class$="red"].⭐️_ {}');
});

scopedStyles('pseudo classes', () => {
  equal(scopeStylesheet('p:lang(en) {}', '_'), 'p:lang(en).⭐️_ {}');
  equal(scopeStylesheet('a:link {}', '_'), 'a:link.⭐️_ {}');
  equal(scopeStylesheet('p:nth-child(2) {}', '_'), 'p:nth-child(2).⭐️_ {}');
  equal(scopeStylesheet('p:nth-child(3n+1) {}', '_'), 'p:nth-child(3n+1).⭐️_ {}');
});
scopedStyles('pseudo classes without selector', () => {
  equal(scopeStylesheet(':root {}', '_'), ':root.⭐️_ {}');
});
scopedStyles('pseudo selector with negation', () => {
  equal(scopeStylesheet('p:not(.blue) {}', '_'), 'p:not(.blue.⭐️_).⭐️_ {}');
});
scopedStyles('pseudo selector with :nth', () => {
  equal(scopeStylesheet('p:nth-child(3n+1):hover {}', '_'), 'p:nth-child(3n+1):hover.⭐️_ {}');
  equal(scopeStylesheet('p:nth-child(3n+1) div {}', '_'), 'p:nth-child(3n+1).⭐️_ div.⭐️_ {}');
});

scopedStyles('pseudo elements', () => {
  equal(scopeStylesheet('::selection {}', '_'), '.⭐️_::selection {}');
  equal(scopeStylesheet(' ::space {}', '_'), ' .⭐️_::space {}');

  equal(scopeStylesheet('a::before {}', '_'), 'a.⭐️_::before {}');
  equal(scopeStylesheet('a::after {}', '_'), 'a.⭐️_::after {}');

  equal(scopeStylesheet('a::first-line {}', '_'), 'a.⭐️_::first-line {}');

  equal(scopeStylesheet('a.red::before {}', '_'), 'a.red.⭐️_::before {}');
  equal(scopeStylesheet('a.red span::before {}', '_'), 'a.red.⭐️_ span.⭐️_::before {}');
  ['before', 'after', 'first-letter', 'first-line'].forEach((selector) => {
    equal(scopeStylesheet(`:${selector} {}`, '_'), `.⭐️_:${selector} {}`);
    equal(scopeStylesheet(`a:${selector} {}`, '_'), `a.⭐️_:${selector} {}`);
  });
});

scopedStyles('complex properties', () => {
  equal(
    scopeStylesheet('div { background: #D0E4F5 url("./bg.jpg") no-repeat scroll 0 0; }', '_'),
    'div.⭐️_ { background: #D0E4F5 url("./bg.jpg") no-repeat scroll 0 0; }'
  );

  equal(
    scopeStylesheet(
      'div { background: -webkit-linear-gradient(left, #1C6EA4 0%, #2388CB 50%, #144E75 100%); }',
      '_'
    ),
    'div.⭐️_ { background: -webkit-linear-gradient(left, #1C6EA4 0%, #2388CB 50%, #144E75 100%); }'
  );
});

scopedStyles('@keyframe', () => {
  equal(
    scopeStylesheet('@keyframes slidein {from{b:c(0%);}to{b:c(0%);}}', '_'),
    '@keyframes slidein {from{b:c(0%);}to{b:c(0%);}}'
  );
  equal(
    scopeStylesheet('@-prefix-keyframes slidein {from{b:c(0%);}to{b:c(0%);}}', '_'),
    '@-prefix-keyframes slidein {from{b:c(0%);}to{b:c(0%);}}'
  );
});

scopedStyles('animation-name', () => {
  equal(scopeStylesheet('p{animation-name: x}', '_'), 'p.⭐️_{animation-name: x}');
});

scopedStyles('animation', () => {
  equal(scopeStylesheet('p{animation: a b c }', '_'), 'p.⭐️_{animation: a b c }');
});

scopedStyles('@font-face', () => {
  equal(
    scopeStylesheet(
      '@font-face { font-family: "Open Sans"; src: url("/fonts/OpenSans-Regular-webfont.woff2") format("woff2"), url("/fonts/OpenSans-Regular-webfont.woff") format("woff"); }',
      '_'
    ),
    '@font-face { font-family: "Open Sans"; src: url("/fonts/OpenSans-Regular-webfont.woff2") format("woff2"), url("/fonts/OpenSans-Regular-webfont.woff") format("woff"); }'
  );
});

scopedStyles('@media', () => {
  equal(
    scopeStylesheet('@media screen and (min-width: 900px) { div {} }', '_'),
    '@media screen and (min-width: 900px) { div.⭐️_ {} }'
  );
});

scopedStyles('@supports', () => {
  equal(
    scopeStylesheet(
      '@supports (display: flex) { @media screen and (min-width: 900px) { div {} } }',
      '_'
    ),
    '@supports (display: flex) { @media screen and (min-width: 900px) { div.⭐️_ {} } }'
  );
});

scopedStyles('@supports nested', () => {
  equal(scopeStylesheet('@media screen(a:1){}div{}', '_'), '@media screen(a:1){}div.⭐️_{}');

  equal(
    scopeStylesheet('@supports(d:b){div{}@media screen(a:1){div{}}div{}}', '_'),
    '@supports(d:b){div.⭐️_{}@media screen(a:1){div.⭐️_{}}div.⭐️_{}}'
  );

  equal(
    scopeStylesheet('@supports not (not (transform-origin: 2px)) { div {} }', '_'),
    '@supports not (not (transform-origin: 2px)) { div.⭐️_ {} }'
  );
  equal(
    scopeStylesheet('@supports (display: grid) and (not (display: inline-grid)) { div {} }', '_'),
    '@supports (display: grid) and (not (display: inline-grid)) { div.⭐️_ {} }'
  );

  equal(
    scopeStylesheet(
      '@supports ((perspective: 10px) or (-moz-perspective: 10px) or (-webkit-perspective: 10px) or (-ms-perspective: 10px) or (-o-perspective: 10px)) { div {} }',
      '_'
    ),
    '@supports ((perspective: 10px) or (-moz-perspective: 10px) or (-webkit-perspective: 10px) or (-ms-perspective: 10px) or (-o-perspective: 10px)) { div.⭐️_ {} }'
  );
});

scopedStyles('comments', () => {
  equal(scopeStylesheet('div {} /* comment */', '_'), 'div.⭐️_ {} /* comment */');
  equal(scopeStylesheet('div { /**/ }', '_'), 'div.⭐️_ { /**/ }');
  equal(scopeStylesheet('div /* comment */ {}', '_'), 'div.⭐️_ /* comment */ {}');
  equal(scopeStylesheet('div/* comment */ {}', '_'), 'div.⭐️_/* comment */ {}');
  equal(scopeStylesheet('/* comment */div {}', '_'), '/* comment */div.⭐️_ {}');
  equal(
    scopeStylesheet('div /* comment */ > span {}', '_'),
    'div.⭐️_ /* comment */ > span.⭐️_ {}'
  );
});

scopedStyles('global selector', () => {
  equal(scopeStylesheet(':global(*) {}', '_'), '* {}');
});
scopedStyles('global selector with attribute', () => {
  equal(scopeStylesheet(':global([t="("]) {}', '_'), '[t="("] {}');

  equal(scopeStylesheet(':global(div) {}', '_'), 'div {}');
  equal(scopeStylesheet(':global(div), p {}', '_'), 'div, p.⭐️_ {}');

  equal(scopeStylesheet('div :global(p) {}', '_'), 'div.⭐️_ p {}');
  equal(scopeStylesheet(':global(div) > p {}', '_'), 'div > p.⭐️_ {}');

  equal(scopeStylesheet(':global(.red) {}', '_'), '.red {}');
  equal(scopeStylesheet(':global(div).red {}', '_'), 'div.red.⭐️_ {}');
  equal(scopeStylesheet(':global(div.red) {}', '_'), 'div.red {}');

  equal(scopeStylesheet(':global(#red) {}', '_'), '#red {}');

  equal(scopeStylesheet(':global(div) { }', '_'), 'div { }');
  equal(scopeStylesheet(':global(div) {}', '_'), 'div {}');
  equal(scopeStylesheet(':global(div){color:red;}', '_'), 'div{color:red;}');

  equal(scopeStylesheet(':global(*[target]) {}', '_'), '*[target] {}');
  equal(scopeStylesheet(':global(*[target]) span {}', '_'), '*[target] span.⭐️_ {}');
  equal(scopeStylesheet('*[target] :global(span) {}', '_'), '[target].⭐️_ span {}');

  equal(scopeStylesheet(':global(a):link {}', '_'), 'a:link.⭐️_ {}');
  equal(scopeStylesheet(':global(a:link) {}', '_'), 'a:link {}');
  equal(scopeStylesheet(':global(p:lang(en)) {}', '_'), 'p:lang(en) {}');
  equal(scopeStylesheet(':global(p:nth-child(2)) {}', '_'), 'p:nth-child(2) {}');
  equal(scopeStylesheet(':global(:root) {}', '_'), ':root {}');
  equal(scopeStylesheet(':global(p:not(.blue)) {}', '_'), 'p:not(.blue) {}');
});

scopedStyles('nested global inside not', () => {
  equal(scopeStylesheet('p:not(:global(.red)){}', '_'), 'p:not(.red).⭐️_{}');

  equal(scopeStylesheet(':global(p:nth-child(3n+1):hover) {}', '_'), 'p:nth-child(3n+1):hover {}');
  equal(scopeStylesheet(':global(p:nth-child(3n+1) div) {}', '_'), 'p:nth-child(3n+1) div {}');

  equal(scopeStylesheet(':global(::selection) {}', '_'), '::selection {}');
});
scopedStyles('global with pseudo element', () => {
  equal(scopeStylesheet(':global(a::after){}', '_'), 'a::after{}');
  // equal(scopeStylesheet(':global(a)::before{}', '_'), 'a::before{}');

  equal(scopeStylesheet(':global(a).red::before {}', '_'), 'a.red.⭐️_::before {}');
  equal(scopeStylesheet(':global(a.red) span::before {}', '_'), 'a.red span.⭐️_::before {}');
});

scopedStyles('global with pseudo element', () => {
  equal(
    scopeStylesheet(
      '@keyframes :global(slidein) { from { transform: translateX(0%); } to { transform: translateX(100%); } }',
      '_'
    ),
    '@keyframes slidein { from { transform: translateX(0%); } to { transform: translateX(100%); } }'
  );
  equal(
    scopeStylesheet('@media screen and (min-width: 900px) { :global(div) {} }', '_'),
    '@media screen and (min-width: 900px) { div {} }'
  );
});

scopedStyles.run();

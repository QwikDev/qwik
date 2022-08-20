import { suite } from 'uvu';
import { equal } from 'uvu/assert';
import { scopeStylesheet } from './scoped-stylesheet';

const scopedStyles = suite('scopedStyles');


scopedStyles('selectors', () => {
  equal(scopeStylesheet('* { color: red; }', 'ABC'), '.⭐️ABC * { color: red; }');

  equal(scopeStylesheet('div { color: red; }', 'ABC'), 'div.⭐️ABC { color: red; }');
  equal(scopeStylesheet('div, p { color: red; }', 'ABC'), 'div.⭐️ABC, p.⭐️ABC { color: red; }');

  equal(scopeStylesheet('div p { color: red; }', 'ABC'), 'div.⭐️ABC p.⭐️ABC { color: red; }');
  equal(scopeStylesheet('div > p { color: red; }', 'ABC'), 'div.⭐️ABC > p.⭐️ABC { color: red; }');
  equal(scopeStylesheet('div + p { color: red; }', 'ABC'), 'div.⭐️ABC + p.⭐️ABC { color: red; }');
  equal(scopeStylesheet('div ~ p { color: red; }', 'ABC'), 'div.⭐️ABC ~ p.⭐️ABC { color: red; }');

  equal(scopeStylesheet('.red { color: red; }', 'ABC'), '.red.⭐️ABC { color: red; }');
  equal(scopeStylesheet('div.red { color: red; }', 'ABC'), 'div.red.⭐️ABC { color: red; }');
  equal(scopeStylesheet('.red * { color: red; }', 'ABC'), '.red.⭐️ABC * { color: red; }');
  equal(scopeStylesheet('.red.text { color: red; }', 'ABC'), '.red.text.⭐️ABC { color: red; }');

  equal(scopeStylesheet('#red { color: red; }', 'ABC'), '#red.⭐️ABC { color: red; }');
  equal(scopeStylesheet('div#red { color: red; }', 'ABC'), 'div#red.⭐️ABC { color: red; }');
  equal(scopeStylesheet('#red * { color: red; }', 'ABC'), '#red.⭐️ABC * { color: red; }');

  equal(scopeStylesheet('div { }', 'ABC'), 'div.⭐️ABC { }');
  equal(scopeStylesheet('div {}', 'ABC'), 'div.⭐️ABC {}');
  equal(scopeStylesheet('div { color: red; background-color: blue; }', 'ABC'), 'div.⭐️ABC { color: red;  background-color: blue; }');
  equal(scopeStylesheet('div { color: red !important; }', 'ABC'), 'div.⭐️ABC { color: red !important; }');
  equal(scopeStylesheet('div{color:red;}', 'ABC'), 'div.⭐️ABC{color:red;}');
  equal(scopeStylesheet('div { content: "}"; }', 'ABC'), 'div.⭐️ABC { content: "}"; }');
  equal(scopeStylesheet("div { content: '}'; }", 'ABC'), "div.⭐️ABC { content: '}'; }");
});

scopedStyles('attribute selectors', () => {
  equal(scopeStylesheet('*[target] { color: red; }', 'ABC'), '.⭐️ABC *[target] { color: red; }');
  equal(scopeStylesheet('*[target] span { color: red; }', 'ABC'), '.⭐️ABC *[target] span.⭐️ABC { color: red; }');

  equal(scopeStylesheet('a[target] { color: red; }', 'ABC'), 'a[target].⭐️ABC { color: red; }');
  equal(scopeStylesheet('a[target="_blank"] { color: red; }', 'ABC'), 'a[target="_blank"].⭐️ABC { color: red; }');
  equal(scopeStylesheet('input[type="button"] { color: red; }', 'ABC'), 'input[type="button"].⭐️ABC { color: red; }');

  equal(scopeStylesheet('a[title~="red"] { color: red; }', 'ABC'), 'a[title~="red"].⭐️ABC { color: red; }');
  equal(scopeStylesheet('a[class^="red"] { color: red; }', 'ABC'), 'a[class^="red"].⭐️ABC { color: red; }');
  equal(scopeStylesheet('a[class|="red"] { color: red; }', 'ABC'), 'a[class|="red"].⭐️ABC { color: red; }');
  equal(scopeStylesheet('a[class*="red"] { color: red; }', 'ABC'), 'a[class*="red"].⭐️ABC { color: red; }');
  equal(scopeStylesheet('a[class$="red"] { color: red; }', 'ABC'), 'a[class$="red"].⭐️ABC { color: red; }');
});

scopedStyles('pseudo classes', () => {
  equal(scopeStylesheet('a:link { color: red; }', 'ABC'), 'a:link.⭐️ABC { color: red; }');
  equal(scopeStylesheet('p:lang(en) { color: red; }', 'ABC'), 'p:lang(en).⭐️ABC { color: red; }');
  equal(scopeStylesheet('p:nth-child(2) { color: red; }', 'ABC'), 'p:nth-child(2).⭐️ABC { color: red; }');
  equal(scopeStylesheet('p:nth-child(3n+1) { color: red; }', 'ABC'), 'p:nth-child(3n+1).⭐️ABC { color: red; }');
  equal(scopeStylesheet(':root { color: red; }', 'ABC'), ':root.⭐️ABC { color: red; }');
  equal(scopeStylesheet('p:not(.blue) { color: red; }', 'ABC'), 'p:not(.blue.⭐️ABC).⭐️ABC { color: red; }');

  equal(scopeStylesheet('p:nth-child(3n+1):hover { color: red; }', 'ABC'), 'p:nth-child(3n+1):hover.⭐️ABC { color: red; }');
  equal(scopeStylesheet('p:nth-child(3n+1) div { color: red; }', 'ABC'), 'p:nth-child(3n+1).⭐️ABC div.⭐️ABC { color: red; }');
});

scopedStyles('pseudo elements', () => {
  equal(scopeStylesheet('::selection { color: red; }', 'ABC'), '.⭐️ABC::selection { color: red; }');

  equal(scopeStylesheet('a::before { color: red; }', 'ABC'), 'a.⭐️ABC::before { color: red; }');
  equal(scopeStylesheet('a::after { color: red; }', 'ABC'), 'a.⭐️ABC::after { color: red; }');

  equal(scopeStylesheet('a::first-line { color: red; }', 'ABC'), 'a.⭐️ABC::first-line { color: red; }');

  equal(scopeStylesheet('a.red::before { color: red; }', 'ABC'), 'a.red.⭐️ABC::before { color: red; }');
  equal(scopeStylesheet('a.red span::before { color: red; }', 'ABC'), 'a.red.⭐️ABC span.⭐️ABC::before { color: red; }');
});

scopedStyles('complex properties', () => {
  equal(scopeStylesheet('div { background: #D0E4F5 url("./bg.jpg") no-repeat scroll 0 0; }', 'ABC'), 'div.⭐️ABC { background: #D0E4F5 url("./bg.jpg") no-repeat scroll 0 0; }');

  equal(scopeStylesheet('div { background: -webkit-linear-gradient(left, #1C6EA4 0%, #2388CB 50%, #144E75 100%); }', 'ABC'), 'div.⭐️ABC { background: -webkit-linear-gradient(left, #1C6EA4 0%, #2388CB 50%, #144E75 100%); }');
});

scopedStyles('at rules', () => {
  equal(scopeStylesheet('@keyframes slidein { from { transform: translateX(0%); } to { transform: translateX(100%); } }', 'ABC'), '@keyframes slidein-⭐️ABC { from { transform: translateX(0%); } to { transform: translateX(100%); } }');

  equal(scopeStylesheet('@font-face { font-family: "Open Sans"; src: url("/fonts/OpenSans-Regular-webfont.woff2") format("woff2"), url("/fonts/OpenSans-Regular-webfont.woff") format("woff"); }', 'ABC'), '@font-face { font-family: "Open Sans"; src: url("/fonts/OpenSans-Regular-webfont.woff2") format("woff2"), url("/fonts/OpenSans-Regular-webfont.woff") format("woff"); }');

  equal(scopeStylesheet('@media screen and (min-width: 900px) { div { color: red; } }', 'ABC'), '@media screen and (min-width: 900px) { div.⭐️ABC { color: red; } }');

  equal(scopeStylesheet('@supports (display: flex) { @media screen and (min-width: 900px) { div { color: red; } } }', 'ABC'), '@supports (display: flex) { @media screen and (min-width: 900px) { div.⭐️ABC { color: red; } } }');
  equal(scopeStylesheet('@supports (display: flex) { div { color: red; } @media screen and (min-width: 900px) { div { color: red; } } div { color: red; } }', 'ABC'), '@supports (display: flex) { { div.⭐️ABC { color: red; } @media screen and (min-width: 900px) { div.⭐️ABC { color: red; } } div.⭐️ABC { color: red; } }');


  equal(scopeStylesheet('@supports not (not (transform-origin: 2px)) { div { color: red; } }', 'ABC'), '@supports not (not (transform-origin: 2px)) { div.⭐️ABC { color: red; } }');
  equal(scopeStylesheet('@supports (display: grid) and (not (display: inline-grid)) { div { color: red; } }', 'ABC'), '@supports (display: grid) and (not (display: inline-grid)) { div.⭐️ABC { color: red; } }');

  equal(scopeStylesheet('@supports ((perspective: 10px) or (-moz-perspective: 10px) or (-webkit-perspective: 10px) or (-ms-perspective: 10px) or (-o-perspective: 10px)) { div { color: red; } }', 'ABC'), '@supports ((perspective: 10px) or (-moz-perspective: 10px) or (-webkit-perspective: 10px) or (-ms-perspective: 10px) or (-o-perspective: 10px)) { div.⭐️ABC { color: red; } }');
});

scopedStyles('comments', () => {
  equal(scopeStylesheet('div { color: red; } /* comment */', 'ABC'), 'div.⭐️ABC { color: red; } /* comment */');
  equal(scopeStylesheet('div { /* color: red; */ }', 'ABC'), 'div.⭐️ABC { /* color: red; */ }');
  equal(scopeStylesheet('div /* comment */ { color: red; }', 'ABC'), 'div.⭐️ABC /* comment */ { color: red; }');
  equal(scopeStylesheet('div/* comment */ { color: red; }', 'ABC'), 'div.⭐️ABC/* comment */ { color: red; }');
  equal(scopeStylesheet('/* comment */div { color: red; }', 'ABC'), '/* comment */div.⭐️ABC { color: red; }');
  equal(scopeStylesheet('div /* comment */ > span { color: red; }', 'ABC'), 'div.⭐️ABC /* comment */ > span.⭐️ABC { color: red; }');
});

scopedStyles('global function', () => {
  equal(scopeStylesheet(':global(*) { color: red; }', 'ABC'), '* { color: red; }');

  equal(scopeStylesheet(':global(div) { color: red; }', 'ABC'), 'div { color: red; }');
  equal(scopeStylesheet(':global(div), p { color: red; }', 'ABC'), 'div, p.⭐️ABC { color: red; }');

  equal(scopeStylesheet('div :global(p) { color: red; }', 'ABC'), 'div.⭐️ABC p { color: red; }');
  equal(scopeStylesheet(':global(div) > p { color: red; }', 'ABC'), 'div > p.⭐️ABC { color: red; }');

  equal(scopeStylesheet(':global(.red) { color: red; }', 'ABC'), '.red { color: red; }');
  equal(scopeStylesheet(':global(div).red { color: red; }', 'ABC'), 'div.red { color: red; }');
  equal(scopeStylesheet(':global(div.red) { color: red; }', 'ABC'), 'div.red { color: red; }');


  equal(scopeStylesheet(':global(#red) { color: red; }', 'ABC'), '#red { color: red; }');

  equal(scopeStylesheet(':global(div) { }', 'ABC'), 'div { }');
  equal(scopeStylesheet(':global(div) {}', 'ABC'), 'div {}');
  equal(scopeStylesheet(':global(div){color:red;}', 'ABC'), 'div{color:red;}');


  equal(scopeStylesheet(':global(*[target]) { color: red; }', 'ABC'), '*[target] { color: red; }');
  equal(scopeStylesheet(':global(*[target]) span { color: red; }', 'ABC'), '*[target] span.⭐️ABC { color: red; }')
  equal(scopeStylesheet('a[target] :global(span) { color: red; }', 'ABC'), 'a[target].⭐️ABC span { color: red; }');
  equal(scopeStylesheet('*[target] :global(span) { color: red; }', 'ABC'), '.⭐️ABC *[target] span { color: red; }');


  equal(scopeStylesheet(':global(a):link { color: red; }', 'ABC'), 'a:link { color: red; }');
  equal(scopeStylesheet(':global(a:link) { color: red; }', 'ABC'), 'a:link { color: red; }');
  equal(scopeStylesheet(':global(p:lang(en)) { color: red; }', 'ABC'), 'p:lang(en) { color: red; }');
  equal(scopeStylesheet(':global(p:nth-child(2)) { color: red; }', 'ABC'), 'p:nth-child(2) { color: red; }');
  equal(scopeStylesheet(':global(:root) { color: red; }', 'ABC'), ':root { color: red; }');
  equal(scopeStylesheet(':global(p:not(.blue)) { color: red; }', 'ABC'), 'p:not(.blue) { color: red; }');
  equal(scopeStylesheet('p:not(:global(.blue)) { color: red; }', 'ABC'), 'p:not(.blue).⭐️ABC { color: red; }');

  equal(scopeStylesheet(':global(p:nth-child(3n+1):hover) { color: red; }', 'ABC'), 'p:nth-child(3n+1):hover { color: red; }');
  equal(scopeStylesheet(':global(p:nth-child(3n+1) div) { color: red; }', 'ABC'), 'p:nth-child(3n+1) div { color: red; }');


  equal(scopeStylesheet(':global(::selection) { color: red; }', 'ABC'), '::selection { color: red; }');

  equal(scopeStylesheet(':global(a)::before { color: red; }', 'ABC'), 'a::before { color: red; }');
  equal(scopeStylesheet(':global(a::after) { color: red; }', 'ABC'), 'a::after { color: red; }');

  equal(scopeStylesheet(':global(a).red::before { color: red; }', 'ABC'), 'a.red::before { color: red; }');
  equal(scopeStylesheet(':global(a.red) span::before { color: red; }', 'ABC'), 'a.red span.⭐️ABC::before { color: red; }');


  equal(scopeStylesheet('@keyframes :global(slidein) { from { transform: translateX(0%); } to { transform: translateX(100%); } }', 'ABC'), '@keyframes slidein { from { transform: translateX(0%); } to { transform: translateX(100%); } }');
  equal(scopeStylesheet('@media screen and (min-width: 900px) { :global(div) { color: red; } }', 'ABC'), '@media screen and (min-width: 900px) { div { color: red; } }');
});

scopedStyles.run();
